// Stream sintetici a 1 Hz per i test dell'analisi prestazioni.
export function syntheticRun({
    seconds,
    speed = () => 3,
    altitude = null,
    hr = null,
    gct = null,
    vo = null,
    watts = null,
    altitudeType = 'fixed_altitude',
    gctType = 'stance_time'
}) {
    const time = [];
    const distance = [];
    const alt = [];
    const heart = [];
    const contact = [];
    const oscillation = [];
    const power = [];
    let d = 0;
    for (let t = 0; t <= seconds; t += 1) {
        if (t > 0) d += speed(t, d);
        time.push(t);
        distance.push(Math.round(d * 100) / 100);
        if (altitude) alt.push(altitude(d, t));
        if (hr) heart.push(hr(t, d));
        if (gct) contact.push(gct(t, d));
        if (vo) oscillation.push(vo(t, d));
        if (watts) power.push(watts(t, d));
    }
    const streams = [{ type: 'time', data: time }, { type: 'distance', data: distance }];
    if (altitude) streams.push({ type: altitudeType, data: alt });
    if (hr) streams.push({ type: 'heartrate', data: heart });
    if (gct) streams.push({ type: gctType, data: contact });
    if (vo) streams.push({ type: 'vertical_oscillation', data: oscillation });
    if (watts) streams.push({ type: 'watts', data: power });
    return streams;
}

export function runActivity(overrides = {}) {
    return {
        id: 'i100',
        name: 'Corsa',
        type: 'Run',
        start_date_local: '2026-11-20T08:00:00',
        moving_time: 3600,
        distance: 10800,
        total_elevation_gain: 0,
        icu_training_load: 60,
        ...overrides
    };
}

// Rumore deterministico per simulare il barometro.
export function noise(t, amplitude = 1) {
    return amplitude * Math.sin(t * 1.7) * Math.cos(t * 0.37);
}
