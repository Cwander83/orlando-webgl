export const ORLANDO_LATITUDE = 28.5383;
export const ORLANDO_LONGITUDE = -81.3792;
export const ORLANDO_TIMEZONE = 'America/New_York';

export interface OrlandoSolarState {
  timeOfDay: number;
  localTimeLabel: string;
  sunDirection: [number, number, number];
}

export interface WmoAtmosphere {
  stormIntensity: number;
  conditionLabel: string;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function getOrlandoLocalParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ORLANDO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number.parseInt(part.value, 10);
    }
  }

  return {
    year: map.year ?? date.getUTCFullYear(),
    month: map.month ?? date.getUTCMonth() + 1,
    day: map.day ?? date.getUTCDate(),
    hour: (map.hour ?? date.getUTCHours()) % 24,
    minute: map.minute ?? date.getUTCMinutes(),
    second: map.second ?? date.getUTCSeconds(),
  };
}

function formatOrlandoTimeLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ORLANDO_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function computeDayOfYear(year: number, month: number, day: number): number {
  const utcDay = Date.UTC(year, month - 1, day);
  const utcStart = Date.UTC(year, 0, 0);
  return Math.floor((utcDay - utcStart) / 86_400_000);
}

function computeSunDirection(date: Date, localDecimalHour: number, dayOfYear: number): [number, number, number] {
  const degToRad = Math.PI / 180;
  const latRad = ORLANDO_LATITUDE * degToRad;

  // Approximate solar declination in radians
  const declination = 23.44 * degToRad * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));

  // Estimate Orlando standard/daylight meridian offset from UTC via Intl offset
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const localMinutes = Math.round(localDecimalHour * 60);
  let tzOffsetHours = (localMinutes - utcMinutes) / 60;
  if (tzOffsetHours > 12) tzOffsetHours -= 24;
  if (tzOffsetHours < -12) tzOffsetHours += 24;

  const lstm = 15 * tzOffsetHours;
  const b = ((2 * Math.PI) / 365) * (dayOfYear - 81);
  const equationOfTimeMinutes = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const solarTimeHours =
    localDecimalHour + (4 * (ORLANDO_LONGITUDE - lstm) + equationOfTimeMinutes) / 60;

  const hourAngleRad = (solarTimeHours - 12) * 15 * degToRad;

  const sinAlt =
    Math.sin(latRad) * Math.sin(declination) +
    Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngleRad);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAlt = Math.cos(altitude);

  // Convert solar altitude/azimuth to scene coordinates (+X East, +Y Up, +Z South)
  const sinAz = -Math.cos(declination) * Math.sin(hourAngleRad);
  const cosAz =
    Math.sin(declination) * Math.cos(latRad) -
    Math.cos(declination) * Math.sin(latRad) * Math.cos(hourAngleRad);
  const azimuth = Math.atan2(sinAz, cosAz);

  const x = cosAlt * Math.sin(azimuth);
  const y = Math.sin(altitude);
  const z = cosAlt * Math.cos(azimuth);

  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/**
 * Maps Orlando local solar clock (America/New_York) onto the scene's [0, 1] atmospheric curve:
 * - 06:00–07:30 (dawn): ~0.08–0.22
 * - 12:00–13:30 (solar noon): ~0.35–0.44
 * - 16:00–17:00 (4 PM afternoon/squall): ~0.52–0.62
 * - 19:00–20:30 (dusk/early night): ~0.68–0.78
 * - 23:00–05:00 (night): >= 0.88
 */
function mapLocalHourToSceneTime(decimalHour: number): number {
  const h = ((decimalHour % 24) + 24) % 24;

  if (h >= 5.5 && h < 19.5) {
    // 05:30 -> 0.04, 06:45 -> 0.11, 12:30 -> 0.40, 16:15 -> 0.58, 19:30 -> 0.74
    return 0.04 + ((h - 5.5) / 14.0) * 0.7;
  }

  if (h >= 19.5) {
    // 19:30 -> 0.74, 23:00 -> 0.90, 24:00 -> 0.94
    return 0.74 + ((h - 19.5) / 4.5) * 0.2;
  }

  // 00:00 -> 0.94, 05:30 -> 0.99 (deep night before sunrise)
  return 0.94 + (h / 5.5) * 0.05;
}

export function computeOrlandoTimeOfDay(date: Date = new Date()): OrlandoSolarState {
  const parts = getOrlandoLocalParts(date);
  const decimalHour = parts.hour + parts.minute / 60 + parts.second / 3600;
  const dayOfYear = computeDayOfYear(parts.year, parts.month, parts.day);

  return {
    timeOfDay: clamp01(mapLocalHourToSceneTime(decimalHour)),
    localTimeLabel: formatOrlandoTimeLabel(date),
    sunDirection: computeSunDirection(date, decimalHour, dayOfYear),
  };
}

export function mapWmoToAtmosphere(
  weatherCode: number,
  cloudCover: number,
  precipitation: number
): WmoAtmosphere {
  const code = Number.isFinite(weatherCode) ? Math.round(weatherCode) : 0;
  const clouds = Number.isFinite(cloudCover) ? Math.min(100, Math.max(0, cloudCover)) : 0;
  const precip = Number.isFinite(precipitation) ? Math.max(0, precipitation) : 0;
  const precipBoost = Math.min(0.15, precip * 0.03);
  const cloudFactor = clouds / 100;

  // Thunderstorms (95, 96, 99)
  if (code >= 95) {
    return {
      stormIntensity: clamp01(Math.max(0.85, 0.86 + precipBoost + cloudFactor * 0.08)),
      conditionLabel: code >= 96 ? 'Severe Thunderstorm' : 'Thunderstorm',
    };
  }

  // Rain showers (80, 81, 82)
  if (code >= 80 && code <= 82) {
    const base = code === 82 ? 0.78 : code === 81 ? 0.65 : 0.52;
    return {
      stormIntensity: clamp01(base + precipBoost),
      conditionLabel: code === 82 ? 'Heavy Showers' : 'Rain Showers',
    };
  }

  // Freezing rain / snow codes (66-77, 85-86)
  if ((code >= 66 && code <= 77) || code === 85 || code === 86) {
    return {
      stormIntensity: clamp01(0.62 + precipBoost),
      conditionLabel: 'Heavy Precipitation',
    };
  }

  // Rain (61, 63, 65)
  if (code >= 61 && code <= 65) {
    const base = code === 65 ? 0.8 : code === 63 ? 0.64 : 0.48;
    return {
      stormIntensity: clamp01(base + precipBoost),
      conditionLabel: code === 65 ? 'Heavy Rain' : 'Rain',
    };
  }

  // Drizzle (51-57)
  if (code >= 51 && code <= 57) {
    return {
      stormIntensity: clamp01(0.32 + precipBoost + cloudFactor * 0.1),
      conditionLabel: 'Light Drizzle',
    };
  }

  // Fog (45, 48)
  if (code === 45 || code === 48) {
    return {
      stormIntensity: clamp01(0.24 + cloudFactor * 0.12),
      conditionLabel: 'Mist & Fog',
    };
  }

  // Overcast (3)
  if (code === 3) {
    return {
      stormIntensity: clamp01(0.22 + cloudFactor * 0.2),
      conditionLabel: 'Overcast',
    };
  }

  // Partly cloudy (2)
  if (code === 2) {
    return {
      stormIntensity: clamp01(0.08 + cloudFactor * 0.14),
      conditionLabel: 'Partly Cloudy',
    };
  }

  // Mainly clear (1)
  if (code === 1) {
    return {
      stormIntensity: clamp01(cloudFactor * 0.08),
      conditionLabel: 'Mostly Clear',
    };
  }

  // Clear sky (0)
  return {
    stormIntensity: clamp01(cloudFactor * 0.05),
    conditionLabel: 'Clear Sky',
  };
}
