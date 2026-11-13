import { NextResponse } from 'next/server';
import { computeOrlandoTimeOfDay, mapWmoToAtmosphere, ORLANDO_LATITUDE, ORLANDO_LONGITUDE } from '@/lib/orlando-sky';
import type { LiveWeatherSnapshot } from '@/lib/scene-store';

export const revalidate = 900;

interface OpenMeteoCurrentPayload {
  current?: {
    temperature_2m?: unknown;
    weather_code?: unknown;
    cloud_cover?: unknown;
    precipitation?: unknown;
  };
}

function buildFallbackSnapshot(): LiveWeatherSnapshot {
  const solar = computeOrlandoTimeOfDay(new Date());
  return {
    tempF: null,
    conditionLabel: 'Offline sky',
    stormIntensity: 0,
    timeOfDay: solar.timeOfDay,
    localTimeLabel: solar.localTimeLabel,
    fallback: true,
  };
}

function isValidNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export async function GET(): Promise<NextResponse<LiveWeatherSnapshot>> {
  const solar = computeOrlandoTimeOfDay(new Date());

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(ORLANDO_LATITUDE));
  url.searchParams.set('longitude', String(ORLANDO_LONGITUDE));
  url.searchParams.set('current', 'temperature_2m,weather_code,cloud_cover,precipitation');
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('timezone', 'America/New_York');

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 900 },
    });

    if (!response.ok) {
      return NextResponse.json(buildFallbackSnapshot(), { status: 200 });
    }

    const payload = (await response.json()) as OpenMeteoCurrentPayload;
    const current = payload?.current;
    if (!current || typeof current !== 'object') {
      return NextResponse.json(buildFallbackSnapshot(), { status: 200 });
    }

    const tempF = current.temperature_2m;
    const weatherCode = current.weather_code;
    const cloudCover = current.cloud_cover;
    const precipitation = current.precipitation;

    if (
      !isValidNumber(tempF, -20, 130) ||
      !isValidNumber(weatherCode, 0, 99) ||
      !isValidNumber(cloudCover, 0, 100) ||
      !isValidNumber(precipitation, 0, 500)
    ) {
      return NextResponse.json(buildFallbackSnapshot(), { status: 200 });
    }

    const atmosphere = mapWmoToAtmosphere(weatherCode, cloudCover, precipitation);

    return NextResponse.json(
      {
        tempF: Math.round(tempF),
        conditionLabel: atmosphere.conditionLabel,
        stormIntensity: atmosphere.stormIntensity,
        timeOfDay: solar.timeOfDay,
        localTimeLabel: solar.localTimeLabel,
        fallback: false,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(buildFallbackSnapshot(), { status: 200 });
  }
}
