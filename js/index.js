// Подключаем все модули в правильном порядке для браузера
// Модули экспортируют свои функции в глобальную область видимости

// Utils
window.utils = {};
Object.assign(window.utils, require('./utils/distance'));
Object.assign(window.utils, require('./utils/time'));

// GTFS
window.gtfs = {};
Object.assign(window.gtfs, require('./gtfs/parser'));
Object.assign(window.gtfs, require('./gtfs/cache'));
Object.assign(window.gtfs, require('./gtfs/loader'));

// Routing
window.routing = {};
Object.assign(window.routing, require('./routing/finder'));
Object.assign(window.routing, require('./routing/availability'));

// State
window.state = {};
Object.assign(window.state, require('./state/store'));
Object.assign(window.state, require('./state/favorites'));

// UI
window.ui = {};
Object.assign(window.ui, require('./ui/bus-list'));

// Map
Object.assign(window, require('./map'));
