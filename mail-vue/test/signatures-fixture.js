import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import '../src/style.css';
const pinia = createPinia();
setActivePinia(pinia);
const [ { default: Fixture }, { default: SignatureSettings }, { default: i18n }, { useUserStore }, { useSettingStore }, { useAccountStore } ] = await Promise.all([
  import('./signatures-fixture.vue'), import('../src/components/signature-settings/index.vue'), import('../src/i18n/index.js'), import('../src/store/user.js'), import('../src/store/setting.js'), import('../src/store/account.js')
]);
const app = createApp(Fixture).use(pinia);
useSettingStore().lang = 'en';
useUserStore().user = { email: 'alice@example.test', name: 'Alice', account: { accountId: 1, email: 'alice@example.test', name: 'Alice' } };
useAccountStore().currentAccount = { accountId: 1, email: 'alice@example.test', name: 'Alice' };
i18n.global.locale.value = 'en';
app.use(i18n).use(ElementPlus).use(createRouter({ history: createWebHashHistory(), routes: [{path: '/', component: SignatureSettings}, {path: '/away', component: {render: () => 'Away'}}] }));
app.mount('#app');
