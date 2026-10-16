// Песочница редактора кривых: открывается как /curve.html, чтобы быстро смотреть и шлифовать виджет отдельно от редактора.
import '@1337exp/taoui/styles.css';
import { createApp } from 'vue';
import { initLocale } from '../i18n';
import CurveSandbox from './CurveSandbox.vue';

initLocale();
createApp(CurveSandbox).mount('#app');
