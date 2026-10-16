import '@1337exp/taoui/styles.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { initLocale } from './i18n';

initLocale();
createApp(App).use(createPinia()).mount('#app');
