import hbapp from './hbapp.js'
import {registerServiceWorker} from './services/ServiceWorkerRegistration.js'

alert(
    'fullscreen: ' + window.matchMedia('(display-mode: fullscreen)').matches +
    '\nstandalone: ' + window.matchMedia('(display-mode: standalone)').matches +
    '\nbrowser: ' + matchMedia('(display-mode: browser)').matches
);

hbapp.createProject()
registerServiceWorker()
