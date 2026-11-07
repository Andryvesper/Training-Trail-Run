export function calculateEquivalentDistance(distanceKm, elevationGainMeters, elevationLossMeters = 0) {
    if (distanceKm < 0 || elevationGainMeters < 0 || elevationLossMeters < 0) {
        throw new Error('Distanza e dislivello non possono essere negativi.');
    }
    const equivalentFromGain = elevationGainMeters / 100;
    const equivalentFromLoss = elevationLossMeters / 200;
    return Number((distanceKm + equivalentFromGain + equivalentFromLoss).toFixed(2));
}

export function calculateTrailAdjustedPace(basePaceSecondsPerKm, distanceKm, elevationGainMeters, elevationLossMeters = 0) {
    if (basePaceSecondsPerKm <= 0 || distanceKm <= 0) {
        throw new Error('Passo base e distanza devono essere maggiori di zero.');
    }
    const eqDistance = calculateEquivalentDistance(distanceKm, elevationGainMeters, elevationLossMeters);
    const adjustedSeconds = (basePaceSecondsPerKm * eqDistance) / distanceKm;
    return Math.round(adjustedSeconds);
}