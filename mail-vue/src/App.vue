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
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import itIt from 'element-plus/es/locale/lang/it';
import('@/icons/index.js')
const { locale } = useI18n()
const elementLocale = computed(() => {
  if (settingStore.lang === 'zh') return zhCn
  if (settingStore.lang === 'it') return itIt
  return null
})
locale.value = settingStore.lang
watch(() => settingStore.lang, () => locale.value = settingStore.lang)
</script>
