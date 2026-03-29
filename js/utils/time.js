const { getDistanceBetweenPoints } = require('./distance');

const WALKING_SPEED_KMH = 5;

function getWalkTime(stop, homePoint) {
    const dist = getDistanceBetweenPoints(
        homePoint.lat, homePoint.lon,
        parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)
    );
    return Math.round((dist / WALKING_SPEED_KMH) * 60);
}

function timeToSeconds(timeStr) {
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
}

function calculateWaitTime(arrivalSeconds, currentTime) {
    if (arrivalSeconds > currentTime) {
        return arrivalSeconds - currentTime;
    }
    return (24 * 3600 - currentTime) + arrivalSeconds;
}

module.exports = { getWalkTime, timeToSeconds, calculateWaitTime };
