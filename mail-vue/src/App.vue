<template>
  <el-config-provider :locale="elementLocale">
    <router-view />
  </el-config-provider>
</template>
<script setup>
import { useI18n } from "vue-i18n";
import { computed, watch } from "vue";
import {useSettingStore} from "@/store/setting.js";
const settingStore = useSettingStore()
import zhTw from 'element-plus/es/locale/lang/zh-tw';
import itIt from 'element-plus/es/locale/lang/it';
import('@/icons/index.js')
const { locale } = useI18n()
const elementLocale = computed(() => {
  if (settingStore.lang === 'zh') return zhTw
  if (settingStore.lang === 'it') return itIt
  return null
})
const htmlLanguages = {zh: 'zh-MO', en: 'en', it: 'it'}
const applyLanguage = (lang) => {
  locale.value = lang
  document.documentElement.lang = htmlLanguages[lang] || 'en'
}
applyLanguage(settingStore.lang)
watch(() => settingStore.lang, applyLanguage)
</script>
