// TechTrek Wayfinder: Open-Meteo Weather & Daylight Telemetry Endpoint
// Edge-cached weather forecast, historical climate modeling, and daylight telemetry
// No external API key required.

const POLAND_CITIES = {
  wroclaw: { lat: 51.1079, lng: 17.0385, name: 'Wrocław', defaultTemp: 2, defaultMin: -1, defaultMax: 4, sunrise: '07:38', sunset: '15:47', daylight: '8h 09m', main: 'Clouds', desc: 'Mild Silesian winter climate' },
  poznan:  { lat: 52.4064, lng: 16.9252, name: 'Poznań',  defaultTemp: 1, defaultMin: -2, defaultMax: 3, sunrise: '07:46', sunset: '15:43', daylight: '7h 57m', main: 'Clouds', desc: 'Greater Poland winter climate' },
  torun:   { lat: 53.0138, lng: 18.5984, name: 'Toruń',   defaultTemp: 0, defaultMin: -3, defaultMax: 2, sunrise: '07:46', sunset: '15:33', daylight: '7h 47m', main: 'Snow',   desc: 'Crisp Gothic riverfront chill' },
  gdansk:  { lat: 54.3520, lng: 18.6466, name: 'Gdańsk',  defaultTemp: 2, defaultMin: -1, defaultMax: 5, sunrise: '07:54', sunset: '15:24', daylight: '7h 30m', main: 'Clouds', desc: 'Baltic maritime winter breeze' },
  warsaw:  { lat: 52.2297, lng: 21.0122, name: 'Warsaw',  defaultTemp: 0, defaultMin: -3, defaultMax: 2, sunrise: '07:31', sunset: '15:28', daylight: '7h 57m', main: 'Clouds', desc: 'Central plains winter chill' },
  krakow:  { lat: 50.0647, lng: 19.9450, name: 'Kraków',  defaultTemp: -1, defaultMin: -4, defaultMax: 2, sunrise: '07:25', sunset: '15:44', daylight: '8h 19m', main: 'Snow',   desc: 'Sub-Carpathian winter frost' }
};

const WMO_MAP = {
  0:  { main: 'Clear',         desc: 'Clear sky' },
  1:  { main: 'Mainly Clear',  desc: 'Mainly clear' },
  2:  { main: 'Partly Cloudy', desc: 'Partly cloudy' },
  3:  { main: 'Overcast',      desc: 'Overcast' },
  45: { main: 'Fog',           desc: 'Fog' },
  48: { main: 'Rime Fog',      desc: 'Depositing rime fog' },
  51: { main: 'Drizzle',       desc: 'Light drizzle' },
  53: { main: 'Drizzle',       desc: 'Moderate drizzle' },
  55: { main: 'Drizzle',       desc: 'Dense drizzle' },
  56: { main: 'Freezing Rain', desc: 'Light freezing drizzle' },
  57: { main: 'Freezing Rain', desc: 'Dense freezing drizzle' },
  61: { main: 'Rain',          desc: 'Slight rain' },
  63: { main: 'Rain',          desc: 'Moderate rain' },
  65: { main: 'Rain',          desc: 'Heavy rain' },
  66: { main: 'Freezing Rain', desc: 'Light freezing rain' },
  67: { main: 'Freezing Rain', desc: 'Heavy freezing rain' },
  71: { main: 'Snow',          desc: 'Slight snowfall' },
  73: { main: 'Snow',          desc: 'Moderate snowfall' },
  75: { main: 'Snow',          desc: 'Heavy snowfall' },
  77: { main: 'Snow',          desc: 'Snow grains' },
  80: { main: 'Rain Showers',  desc: 'Slight rain showers' },
  81: { main: 'Rain Showers',  desc: 'Moderate rain showers' },
  82: { main: 'Rain Showers',  desc: 'Violent rain showers' },
  85: { main: 'Snow Showers',  desc: 'Slight snow showers' },
  86: { main: 'Snow Showers',  desc: 'Heavy snow showers' },
  95: { main: 'Thunderstorm',  desc: 'Thunderstorm' },
  96: { main: 'Thunderstorm',  desc: 'Thunderstorm with slight hail' },
  99: { main: 'Thunderstorm',  desc: 'Thunderstorm with heavy hail' }
};

// In-memory module cache (isolate-scoped)
const memoryCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function normalizeCitySlug(str) {
  if (!str) return 'krakow';
  return str.toLowerCase().trim()
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ą/g, 'a')
    .replace(/ę/g, 'e')
    .replace(/ś/g, 's')
    .replace(/ź/g, 'z')
    .replace(/ż/g, 'z');
}

function calculateDaylight(sunriseStr, sunsetStr) {
  if (!sunriseStr || !sunsetStr) return null;
  const parseTime = (str) => {
    const part = str.includes('T') ? str.split('T')[1] : str;
    const [h, m] = part.split(':').map(Number);
    return h * 60 + m;
  };
  const riseMins = parseTime(sunriseStr);
  const setMins = parseTime(sunsetStr);
  if (isNaN(riseMins) || isNaN(setMins) || setMins <= riseMins) return null;
  const diff = setMins - riseMins;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

function formatClockTime(isoStr) {
  if (!isoStr) return null;
  if (!isoStr.includes('T')) return isoStr;
  return isoStr.split('T')[1].slice(0, 5);
}

function getWinterAdvisory(tempMin, tempMax, main, snowfallSum) {
  const isFreezing = tempMin <= 0 || tempMax <= 2;
  const hasSnow = main === 'Snow' || main === 'Snow Showers' || (snowfallSum && snowfallSum > 0);
  const hasIce = main === 'Freezing Rain';

  if (hasIce) {
    return 'Black ice hazard. High-traction winter footwear and slow walking pace recommended across historic cobblestones.';
  }
  if (hasSnow) {
    return 'Snowfall expected. Waterproof winter boots, thermal base layers, and warm headwear recommended.';
  }
  if (isFreezing) {
    return 'Sub-zero winter chill. Layered fleece or down outerwear, windproof gloves, and insulated socks recommended.';
  }
  return 'Cool European winter weather. A warm jacket and water-resistant layers recommended.';
}

export async function handleWeather(context, url, method) {
  if (method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawCity = url.searchParams.get('city') || '';
  const cityKey = normalizeCitySlug(rawCity);
  const cityConfig = POLAND_CITIES[cityKey] || POLAND_CITIES.krakow;

  let lat = parseFloat(url.searchParams.get('lat'));
  let lng = parseFloat(url.searchParams.get('lng'));
  const dateParam = url.searchParams.get('date')?.trim(); // YYYY-MM-DD

  // Fallback to city coordinates if lat/lng are missing
  if (isNaN(lat) || isNaN(lng)) {
    lat = cityConfig.lat;
    lng = cityConfig.lng;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return new Response(JSON.stringify({ error: 'Coordinates out of bounds' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}_${dateParam || 'current'}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return new Response(JSON.stringify(cached.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=10800',
        'X-Cache': 'HIT-MEMORY',
      },
    });
  }

  try {
    const now = new Date();
    let targetDate = dateParam ? new Date(dateParam + 'T12:00:00Z') : null;
    let diffDays = targetDate ? (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) : null;

    let result = null;

    // 1. Target within active forecast window (-1 to +16 days) or no date provided
    if (diffDays === null || (diffDays >= -1 && diffDays <= 16)) {
      const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,precipitation_probability_max,snowfall_sum,sunrise,sunset&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto&forecast_days=16`;
      
      const res = await fetch(forecastUrl);
      if (res.ok) {
        const data = await res.json();

        if (dateParam && data.daily?.time) {
          const idx = data.daily.time.indexOf(dateParam);
          if (idx !== -1) {
            const code = data.daily.weathercode?.[idx] ?? data.daily.weather_code?.[idx] ?? 3;
            const wmo = WMO_MAP[code] || { main: 'Clouds', desc: 'Cloudy' };
            const tMax = Math.round(data.daily.temperature_2m_max[idx]);
            const tMin = Math.round(data.daily.temperature_2m_min[idx]);
            const tAvg = Math.round((tMax + tMin) / 2);
            const precipProb = data.daily.precipitation_probability_max?.[idx] ?? 0;
            const snowfall = data.daily.snowfall_sum?.[idx] ?? 0;
            const sunrise = formatClockTime(data.daily.sunrise?.[idx]) || cityConfig.sunrise;
            const sunset = formatClockTime(data.daily.sunset?.[idx]) || cityConfig.sunset;

            result = {
              type: 'forecast',
              city: cityConfig.name,
              date: dateParam,
              temp: tAvg,
              temp_max: tMax,
              temp_min: tMin,
              main: wmo.main,
              description: wmo.desc,
              wmo_code: code,
              precipitation_probability: precipProb,
              precipitation_sum: data.daily.precipitation_sum?.[idx] ?? 0,
              snowfall_sum: snowfall,
              sunrise,
              sunset,
              daylight_hours: calculateDaylight(data.daily.sunrise?.[idx], data.daily.sunset?.[idx]) || cityConfig.daylight,
              is_winter_advisory: tMin <= 0 || snowfall > 0,
              advisory: getWinterAdvisory(tMin, tMax, wmo.main, snowfall),
              timestamp: Date.now()
            };
          }
        }

        // If no date or date matched current day
        if (!result && data.current) {
          const curCode = data.current.weather_code ?? data.current.weathercode ?? 3;
          const wmo = WMO_MAP[curCode] || { main: 'Clouds', desc: 'Cloudy' };
          const tMax = Math.round(data.daily?.temperature_2m_max?.[0] ?? data.current.temperature_2m);
          const tMin = Math.round(data.daily?.temperature_2m_min?.[0] ?? data.current.temperature_2m);
          const curTemp = Math.round(data.current.temperature_2m);
          const snowfall = data.daily?.snowfall_sum?.[0] ?? 0;
          const sunrise = formatClockTime(data.daily?.sunrise?.[0]) || cityConfig.sunrise;
          const sunset = formatClockTime(data.daily?.sunset?.[0]) || cityConfig.sunset;

          result = {
            type: 'current',
            city: cityConfig.name,
            date: data.daily?.time?.[0] || now.toISOString().slice(0, 10),
            temp: curTemp,
            temp_max: tMax,
            temp_min: tMin,
            main: wmo.main,
            description: wmo.desc,
            wmo_code: curCode,
            humidity: data.current.relative_humidity_2m ?? null,
            wind_speed: data.current.wind_speed_10m ?? null,
            precipitation_probability: data.daily?.precipitation_probability_max?.[0] ?? 0,
            snowfall_sum: snowfall,
            sunrise,
            sunset,
            daylight_hours: calculateDaylight(data.daily?.sunrise?.[0], data.daily?.sunset?.[0]) || cityConfig.daylight,
            is_winter_advisory: tMin <= 0 || snowfall > 0,
            advisory: getWinterAdvisory(tMin, tMax, wmo.main, snowfall),
            timestamp: Date.now()
          };
        }
      }
    }

    // 2. Far-future dates (> 16 days ahead): Historical seasonal climate baseline
    if (!result && diffDays !== null && diffDays > 16) {
      const targetMonth = targetDate.getUTCMonth(); // 0-11
      const targetDay = targetDate.getUTCDate();
      
      // Query Open-Meteo Archive for the same calendar window last year (2025)
      const refYear = 2025;
      const refStart = new Date(Date.UTC(refYear, targetMonth, Math.max(1, targetDay - 2)));
      const refEnd = new Date(Date.UTC(refYear, targetMonth, Math.min(28, targetDay + 2)));
      const startStr = refStart.toISOString().slice(0, 10);
      const endStr = refEnd.toISOString().slice(0, 10);

      const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,weathercode&timezone=auto`;
      
      const archRes = await fetch(archiveUrl);

      if (archRes.ok) {
        const archData = await archRes.json();
        const daily = archData.daily;
        if (daily && daily.time && daily.time.length > 0) {
          let sumMax = 0, sumMin = 0, sumPrecip = 0, sumSnow = 0, count = 0;
          for (let i = 0; i < daily.time.length; i++) {
            if (daily.temperature_2m_max[i] != null && daily.temperature_2m_min[i] != null) {
              sumMax += daily.temperature_2m_max[i];
              sumMin += daily.temperature_2m_min[i];
              sumPrecip += daily.precipitation_sum?.[i] || 0;
              sumSnow += daily.snowfall_sum?.[i] || 0;
              count++;
            }
          }
          if (count > 0) {
            const avgMax = Math.round(sumMax / count);
            const avgMin = Math.round(sumMin / count);
            const avgTemp = Math.round((avgMax + avgMin) / 2);
            const avgSnow = parseFloat((sumSnow / count).toFixed(1));
            const hasSnow = avgSnow > 0.2 || avgTemp <= 0;
            const main = hasSnow ? 'Snow' : (sumPrecip / count > 2 ? 'Rain' : 'Clouds');
            const desc = hasSnow ? `Seasonal winter snow potential in ${cityConfig.name}` : `Historical climate baseline for ${cityConfig.name}`;

            result = {
              type: 'climate',
              city: cityConfig.name,
              date: dateParam,
              temp: avgTemp,
              temp_max: avgMax,
              temp_min: avgMin,
              main,
              description: desc,
              wmo_code: hasSnow ? 71 : 3,
              precipitation_probability: hasSnow ? 50 : 30,
              precipitation_sum: parseFloat((sumPrecip / count).toFixed(1)),
              snowfall_sum: avgSnow,
              sunrise: cityConfig.sunrise,
              sunset: cityConfig.sunset,
              daylight_hours: cityConfig.daylight,
              is_winter_advisory: avgMin <= 0 || hasSnow,
              advisory: getWinterAdvisory(avgMin, avgMax, main, avgSnow),
              timestamp: Date.now()
            };
          }
        }
      }
    }

    // 3. Fallback per-city if external Open-Meteo is temporarily unreachable
    if (!result) {
      result = {
        type: 'climate',
        city: cityConfig.name,
        date: dateParam || now.toISOString().slice(0, 10),
        temp: cityConfig.defaultTemp,
        temp_max: cityConfig.defaultMax,
        temp_min: cityConfig.defaultMin,
        main: cityConfig.main,
        description: cityConfig.desc,
        wmo_code: cityConfig.main === 'Snow' ? 71 : 3,
        precipitation_probability: 35,
        precipitation_sum: 0.8,
        snowfall_sum: cityConfig.main === 'Snow' ? 0.8 : 0,
        sunrise: cityConfig.sunrise,
        sunset: cityConfig.sunset,
        daylight_hours: cityConfig.daylight,
        is_winter_advisory: cityConfig.defaultMin <= 0,
        advisory: getWinterAdvisory(cityConfig.defaultMin, cityConfig.defaultMax, cityConfig.main, 0.5),
        timestamp: Date.now()
      };
    }

    memoryCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=10800',
        'X-Cache': 'MISS-FETCH',
      },
    });

  } catch (err) {
    console.error('[weather-worker] error fetching weather:', err);
    const fallback = {
      type: 'climate',
      city: cityConfig.name,
      date: dateParam || new Date().toISOString().slice(0, 10),
      temp: cityConfig.defaultTemp,
      temp_max: cityConfig.defaultMax,
      temp_min: cityConfig.defaultMin,
      main: cityConfig.main,
      description: cityConfig.desc,
      wmo_code: 71,
      precipitation_probability: 35,
      precipitation_sum: 0.8,
      snowfall_sum: 0.5,
      sunrise: cityConfig.sunrise,
      sunset: cityConfig.sunset,
      daylight_hours: cityConfig.daylight,
      is_winter_advisory: true,
      advisory: getWinterAdvisory(cityConfig.defaultMin, cityConfig.defaultMax, cityConfig.main, 0.5),
      timestamp: Date.now()
    };
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
