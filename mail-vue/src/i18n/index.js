import { createI18n } from 'vue-i18n';
import en from './en.js'
import it from './it.js'
import zh from './zh.js'
const i18n = createI18n({
    legacy: false,
    messages: {
        zh,
        en,
        it
    },
});

export default i18n;
