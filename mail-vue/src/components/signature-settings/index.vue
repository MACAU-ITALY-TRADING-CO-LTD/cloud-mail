<template>
  <section class="signature-settings" v-loading="loading">
    <h2>{{ t('signatureTitle') }}</h2>
    <p>{{ t('signatureDescription') }}</p>
    <el-alert v-if="failed" :title="t('signatureLoadError')" type="error" :closable="false" />
    <el-button v-if="failed" @click="load">{{ t('signatureRetry') }}</el-button>
    <template v-if="accounts.length">
      <label for="signature-mailbox">{{ t('sender') }}</label>
      <el-select id="signature-mailbox" :model-value="selectedId" :disabled="saving" @change="selectAccount" :aria-label="t('sender')">
        <el-option v-for="account in accounts" :key="account.accountId" :value="account.accountId" :label="account.email" />
      </el-select>
      <div class="signature-editor">
        <TinyEditor :key="selectedId" ref="editor" :def-value="initialHtml" embedded-images :auto-focus="false" @change="html => form.html = html" @ready="editorReady" />
      </div>
      <p class="hint">{{ t('signatureImageHint') }}</p>
      <el-checkbox v-model="form.autoNew" :disabled="saving">{{ t('signatureAutoNew') }}</el-checkbox>
      <el-checkbox v-model="form.autoReplyForward" :disabled="saving">{{ t('signatureAutoReplyForward') }}</el-checkbox>
      <div><el-button type="primary" :loading="saving" @click="save">{{ t('save') }}</el-button></div>
    </template>
  </section>
</template>
<script setup>
import { onMounted, reactive, ref, computed } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import TinyEditor from '@/components/tiny-editor/index.vue';
import { accountSignatures, accountSaveSignature } from '@/request/account.js';
import { useAccountStore } from '@/store/account.js';
const { t } = useI18n();
const accountStore = useAccountStore();
const accounts = ref([]), selectedId = ref(null), editor = ref(null);
const initialHtml = ref(''), baseline = ref(''), loading = ref(false), saving = ref(false), failed = ref(false);
const form = reactive({ html: '', autoNew: false, autoReplyForward: false });
baseline.value = JSON.stringify(form);
let initializing = false;
const dirty = computed(() => JSON.stringify(form) !== baseline.value);
function editorReady() {
  if (!initializing) return;
  initializing = false;
  form.html = editor.value.getContent();
  baseline.value = JSON.stringify(form);
}
function select(id) {
  const row = accounts.value.find(a => a.accountId === id);
  initializing = selectedId.value !== id;
  selectedId.value = id;
  Object.assign(form, { html: row.html, autoNew: row.autoNew, autoReplyForward: row.autoReplyForward });
  initialHtml.value = row.html;
  baseline.value = JSON.stringify(form);
}
async function mayDiscard() {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm(t('signatureDiscard'), { type: 'warning', confirmButtonText: t('signatureDiscardButton'), cancelButtonText: t('cancel') });
    return true;
  } catch { return false; }
}
async function selectAccount(id) { if (await mayDiscard()) select(id); }
onBeforeRouteLeave(async () => !saving.value && await mayDiscard());
async function load() {
  loading.value = true; failed.value = false;
  try {
    accounts.value = await accountSignatures();
    if (accounts.value.length) select(accounts.value.find(a => a.accountId === accountStore.currentAccount.accountId)?.accountId ?? accounts.value[0].accountId);
  } catch { failed.value = true; } finally { loading.value = false; }
}
async function save() {
  if (saving.value) return;
  form.html = editor.value.getContent();
  if (new TextEncoder().encode(form.html).length > 512 * 1024) { ElMessage.error(t('signatureTooLarge')); return; }
  saving.value = true;
  const submitted = { ...form };
  try {
    const saved = await accountSaveSignature({ accountId: selectedId.value, ...submitted });
    Object.assign(accounts.value.find(a => a.accountId === selectedId.value), saved);
    if (JSON.stringify(form) === JSON.stringify(submitted)) {
      select(selectedId.value);
      editor.value.setContent(saved.html);
      form.html = editor.value.getContent();
      baseline.value = JSON.stringify(form);
    } else {
      // Keep edits typed while the request was in flight, and keep them dirty.
      baseline.value = JSON.stringify({ html: saved.html, autoNew: saved.autoNew, autoReplyForward: saved.autoReplyForward });
    }
    ElMessage.success(t('saveSuccessMsg'));
  } catch { /* The HTTP interceptor displays the error; keep the user's edits. */ } finally { saving.value = false; }
}
onMounted(load);
</script>
<style scoped>
.signature-settings { display: flex; flex-direction: column; gap: 14px; margin-bottom: 40px; max-width: 760px; }
h2 { font-size: 18px; margin: 0; }
p { margin: 0; color: var(--regular-text-color); font-size: 14px; line-height: 1.5; }
.el-select { width: min(100%, 360px); }
.signature-editor { height: 300px; border: 1px solid var(--el-border-color); border-radius: 6px; overflow: hidden; }
.el-checkbox { margin: 0; white-space: normal; height: auto; }
.hint { font-size: 12px; }
</style>
