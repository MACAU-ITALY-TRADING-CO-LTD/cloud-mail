<template>
  <div class="send" v-show="show">
    <div class="write-box">
      <div class="title">
        <div class="title-left">
          <span class="title-text">
            <Icon icon="hugeicons:quill-write-01" width="28" height="28"/>
          </span>
          <span class="sender">{{ $t('sender') }}:</span>
          <el-select class="sender-select" :model-value="form.accountId" @change="changeSender" :aria-label="t('sender')" :disabled="senderChanging">
            <el-option v-for="account in signatureAccounts" :key="account.accountId" :value="account.accountId" :label="`${account.name} <${account.email}>`" />
          </el-select>
        </div>
        <button class="compose-close" type="button" :aria-label="t('signatureClose')" @click="close">
          <Icon icon="material-symbols-light:close-rounded" width="22" height="22"/>
        </button>
      </div>
      <div class="container" :class="{'has-cc': showCc || form.cc.length, 'signature-error': signatureFailed}">
        <el-input-tag  @add-tag="addTagChange" tag-type="primary" @input="inputChange" size="default" v-model="form.receiveEmail" :aria-label="t('recipient')" data-testid="compose-to" >
          <template #prefix>
            <div class="item-title" >{{ $t('recipient') }}</div>
            <el-select
                ref="mySelect"
                class="write-select"
                popper-class="write-select"
                :show-arrow="false"
                :no-match-text="' '"
                :no-data-text="' '"
                @visible-change="selectStatusChange"
                @change="selectChange"
            >
              <el-option
                  v-for="item in selectRecipientList"
                  :key="item"
                  :label="item"
                  :value="item"
                  style="color: #999896;"
              />
            </el-select>
          </template>
          <template #suffix>
            <div style="display: flex;margin-right: 3px;">
              <el-button v-if="!showCc && !form.cc.length" text size="small" @click.stop="showCc = true">{{ t('cc') }}</el-button>
              <Icon icon="fa7-solid:user-plus" width="20" height="20" class="add-contact" @click.stop="openContacts" />
            </div>
          </template>
        </el-input-tag>
        <el-input-tag v-if="showCc || form.cc.length" v-model="form.cc" @add-tag="value => addTagChange(value, 'cc')" :aria-label="t('cc')" data-testid="compose-cc">
          <template #prefix><div class="item-title">{{ t('cc') }}</div></template>
        </el-input-tag>
        <el-input v-model="form.subject" :placeholder="t('subject')" />
        <el-alert v-if="signatureFailed" type="warning" :closable="false" :title="t('signatureLoadError')">
          <el-button text @click="retrySignatures">{{ t('signatureRetry') }}</el-button>
        </el-alert>
        <tinyEditor :def-value="defValue" ref="editor" @change="change" @focus="focusChange" @ready="editorReady" />
        <div class="button-item">
          <el-button text :disabled="!activeSignature?.html || senderChanging" @click="insertSignature">{{ t('signatureInsert') }}</el-button>
          <div class="att-add" @click="chooseFile">
            <Icon icon="iconamoon:attachment-fill" width="24" height="24"/>
          </div>
          <div class="att-clear" @click="clearContent">
            <Icon icon="icon-park-outline:clear-format" width="24" height="24 "/>
          </div>
          <div class="att-list">
            <div class="att-item" v-for="(item,index) in form.attachments" :key="index">
              <Icon v-bind="getIconByName(item.filename)"/>
              <span class="att-filename">{{ item.filename }}</span>
              <span class="att-size">{{ formatBytes(item.size) }}</span>
              <Icon style="cursor: pointer;" icon="material-symbols-light:close-rounded" @click="delAtt(index)"
                    width="22" height="22"/>
            </div>
          </div>
          <div>
            <el-button type="primary" @click="sendEmail" v-if="form.sendType === 'reply'">{{ t(form.replyAll ? 'replyAll' : 'reply') }}</el-button>
            <el-button type="primary" @click="sendEmail" v-else-if="form.sendType === 'forward'">{{ $t('forward') }}</el-button>
            <el-button type="primary" @click="sendEmail" v-else>{{ $t('send') }}</el-button>
          </div>
        </div>
        <Translation keypath="largeAttachmentHint" scope="global" tag="p" class="attachment-hint">
          <template #wetransfer>
            <a :href="fileSharingSites.wetransfer.href" target="_blank" rel="noopener noreferrer">WeTransfer</a>
          </template>
          <template #googleDrive>
            <a :href="fileSharingSites.googleDrive.href" target="_blank" rel="noopener noreferrer">Google Drive</a>
          </template>
        </Translation>
      </div>
    </div>
    <el-dialog top="10vh" v-model="showContacts" @closed="clearSelectContact" :title="t('recentContacts')">
      <el-table ref="contactsTabRef" row-key="email" :data="contacts" style="height: 445px">
        <el-table-column type="selection" width="32" />
        <el-table-column property="email" :label="t('emailAccount')" >
          <template #default="props">
            <div class="email-row">{{ props.row.email }}</div>
          </template>
        </el-table-column>
        <el-table-column width="55" label="" >
          <template #default>
            <div style="display: flex;">
              <Icon icon="mage:user" style="color: var(--el-text-color-primary)" width="22" height="22" color="#606266" />
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="contacts-bottom">
        <el-button type="default" @click="deleteContact">{{t('clear')}}</el-button>
        <el-button type="primary" @click="chooseContact">{{t('selectContacts')}}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import { accountSignatures } from '@/request/account.js';
import { updateSignature, signatureSnapshot } from '@/utils/signatures.js';
import tinyEditor from '@/components/tiny-editor/index.vue'
import {h, nextTick, onMounted, onUnmounted, reactive, ref, toRaw, computed, getCurrentInstance} from "vue";
import {Icon} from "@iconify/vue";
import {useUserStore} from "@/store/user.js";
import {emailSend} from "@/request/email.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {fileToBase64, formatBytes} from "@/utils/file-utils.js";
import {extractEmails, replyRecipients} from '@/utils/recipients.js';
import {isOversizedSendError} from "@/utils/send-error.js";
import {getIconByName} from "@/utils/icon-utils.js";
import sendPercent from "@/components/send-percent/index.vue"
import {toOssDomain} from "@/utils/convert.js";
import {formatDetailDate} from "@/utils/day.js";
import {useSettingStore} from "@/store/setting.js";
import {userDraftStore} from "@/store/draft.js";
import {useWriterStore} from "@/store/writer.js";
import db from "@/db/db.js";
import dayjs from "dayjs";
import {useI18n, Translation} from "vue-i18n";
import router from "@/router/index.js";
import {ElMessageBox} from "element-plus";
import 'element-plus/es/components/message-box/style/css';

defineExpose({
  open,
  openReply,
  openForward,
  openDraft
})

const {t} = useI18n()
const appContext = getCurrentInstance().appContext;
const fileSharingSites = {
  wetransfer: { label: 'WeTransfer', href: 'https://wetransfer.com/' },
  googleDrive: { label: 'Google Drive', href: 'https://drive.google.com/' },
};
const writerStore = useWriterStore();
const draftStore = userDraftStore()
const settingStore = useSettingStore()
const emailStore = useEmailStore();
const accountStore = useAccountStore()
const editor = ref({})
const userStore = useUserStore();
const show = ref(false);
const showCc = ref(false);
const percent = ref(0)
let percentMessage = null
let sending = false
const defValue = ref('')
const signatureAccounts = ref([])
const signatureFailed = ref(false)
const senderChanging = ref(false)
const activeSignature = computed(() => signatureAccounts.value.find(a => a.accountId === form.accountId))
let opening = false
let initialContent = ''
let rememberInitial = false
const contactsTabRef = ref({})
const showContacts = ref(false)
const mySelect = ref()
let selectStatus = false
const backReply = reactive({
  receiveEmail: [],
  cc: [],
  subject: '',
  content: '',
  sendType: ''
})
const form = reactive({
  sendEmail: '',
  receiveEmail: [],
  cc: [],
  accountId: -1,
  name: '',
  subject: '',
  content: '',
  sendType: '',
  text: '',
  emailId: 0,
  attachments: [],
  draftId: null,
  replyAll: false,
  signatureSnapshot: '',
})

const selectRecipientList = ref([])

const contacts = computed(() => writerStore.sendRecipientRecord.map(item => ({email: item})))

function openContacts() {
  showContacts.value = true
  nextTick(() => {
    form.receiveEmail.forEach(item => {
      if (writerStore.sendRecipientRecord.includes(item)) {
        contactsTabRef.value.toggleRowSelection({email: item});
      }
    })
  })
}

function deleteContact() {
  ElMessageBox.confirm(t('confirmDeletionOfContacts'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    const contactList = contactsTabRef.value.getSelectionRows().map(item => item.email);
    form.receiveEmail = form.receiveEmail.filter(item => !contactList.includes(item));
    writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.filter(item => !contactList.includes(item));
  })
}

function chooseContact() {

  const contactList = contactsTabRef.value.getSelectionRows().map(item => item.email);
  contactList.forEach(item => {
    if (!form.receiveEmail.includes(item)) {
      form.receiveEmail.push(item);
    }
  })

  form.receiveEmail = form.receiveEmail.filter(item => {
    return contactList.includes(item) || !writerStore.sendRecipientRecord.includes(item);
  });

  showContacts.value = false
}

function clearSelectContact() {
  contactsTabRef.value.clearSelection();
}

function selectChange(value) {
  form.receiveEmail.push(value)
}

function selectStatusChange(status) {
  selectStatus = status
}

const openSelect = () => {
  mySelect.value.toggleMenu()
}

function inputChange(value) {

  selectRecipientList.value = writerStore.sendRecipientRecord.filter(item => value && !form.receiveEmail.includes(item) && item.startsWith(value)).slice(0, 10);

  if (!selectStatus && selectRecipientList.value.length > 0) {
    openSelect()
  }

  if (selectStatus && selectRecipientList.value.length === 0) {
    openSelect()
  }

}

function addTagChange(val, field = 'receiveEmail') {

  const emails = extractEmails([].concat(val).join(','));

  form[field].splice(form[field].length - 1, 1)

  if (!emails.length) {
    ElMessage({
      message: t('invalidRecipientMsg'),
      type: 'warning',
      plain: true,
    })
    return
  }

  let has = false
  emails.forEach(email => {
    if (![...form.receiveEmail, ...form.cc].some(item => item.toLowerCase() === email.toLowerCase())) {
      form[field].push(email)
      has = true
    }
  })
  if (field === 'receiveEmail' && selectStatus && has) openSelect()
}

function clearContent() {
  ElMessageBox.confirm(t('clearContentConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    resetForm()
  })

}

function delAtt(index) {
  form.attachments.splice(index, 1);
}

function chooseFile() {
  const doc = document.createElement("input")
  doc.setAttribute("type", "file")
  doc.multiple = true;
  doc.click()
  doc.onchange = async (e) => {

    const fileList = e.target.files;

    for (const file of fileList) {

      const size = file.size
      const filename = file.name
      const contentType = file.type

      const content = await fileToBase64(file)
      form.attachments.push({content, filename, size, contentType})

    }

  }
}

async function sendEmail() {
  if (senderChanging.value) return

  if (form.receiveEmail.length === 0) {
    ElMessage({
      message: t('emptyRecipientMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.subject) {
    ElMessage({
      message: t('emptySubjectMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  form.content = editor.value.getContent();

  if (!form.content) {
    ElMessage({
      message: t('emptyContentMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.manyType === 'divide' && form.attachments.length > 0) {
    ElMessage({
      message: t('noSeparateSendMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (sending) {
    ElMessage({
      message: t('sendingErrorMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  percentMessage = ElMessage({
    message: () => h(sendPercent, {value: percent.value, desc: t('sending')}),
    dangerouslyUseHTMLString: true,
    plain: true,
    duration: 0,
    customClass: 'message-bottom'
  })

  sending = true

  show.value = false

  emailSend(form, (e) => {
    percent.value = Math.round((e.loaded * 98) / e.total)
  }).then(emailList => {
    const email = emailList[0]
    emailList.forEach(item => {
      emailStore.sendScroll?.addItem(item)
    })

    ElNotification({
      title: t('sendSuccessMsg'),
      type: "success",
      message: h('span', {style: 'color: teal'}, email.subject),
      position: 'bottom-right'
    })

    userStore.refreshUserInfo();

    addRecipientRecord();

    if (form.draftId) {
      form.subject = ''
      form.content = ''
      form.receiveEmail = []
      form.cc = []
      draftStore.setDraft = {...toRaw(form)}
    }

    show.value = false
    resetForm();
  }).catch((e) => {
    show.value = true
    if (isOversizedSendError(e)) {
      ElMessageBox.alert(
        h(Translation, {
          keypath: 'sendTooLargeMsg',
          scope: 'global',
          tag: 'div',
          style: 'white-space: pre-line; line-height: 1.6',
        }, Object.fromEntries(Object.entries(fileSharingSites).map(([key, site]) => [
          key, () => h('a', {href: site.href, target: '_blank', rel: 'noopener noreferrer'}, site.label)
        ]))),
        t('sendTooLargeTitle'),
        {
          type: 'warning',
          confirmButtonText: t('backToEmail'),
          customClass: 'send-size-error',
        },
        appContext
      ).catch(() => {})
    } else {
      ElNotification({
        title: t('sendFailMsg'),
        type: e.code === 403 ? 'warning' : 'error',
        message: h('span', {style: 'color: teal'}, e.message),
        position: 'bottom-right'
      })
    }
    if (e.code === 401) {
      localStorage.removeItem('token');
      router.replace('/login');
    }
    addRecipientRecord();
  }).finally(() => {
    percentMessage.close()
    percent.value = 0
    sending = false
  })
}

function addRecipientRecord() {
  writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.filter(
      email => !form.receiveEmail.includes(email)
  );

  writerStore.sendRecipientRecord.unshift(...form.receiveEmail);
  writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.slice(0, 500);
}

function resetForm() {
  form.signatureSnapshot = ''
  initialContent = ''
  rememberInitial = false
  defValue.value = ''
  form.receiveEmail = []
  form.cc = []
  showCc.value = false
  form.replyAll = false
  form.subject = ''
  form.content = ''
  form.manyType = null
  form.attachments = []
  form.sendType = ''
  form.emailId = 0
  form.draftId = null
  backReply.content = ''
  backReply.subject = ''
  backReply.receiveEmail = []
  backReply.cc = []
  backReply.sendType = ''
  editor.value.clearEditor()
}

function change(content, text) {
  form.content = content;
  form.text = text
}

function focusChange() {
  if (selectStatus) openSelect()
}

async function loadSignatures() {
  signatureFailed.value = false
  try {
    signatureAccounts.value = await accountSignatures()
  } catch {
    signatureFailed.value = true
    const current = accountStore.currentAccount.email ? accountStore.currentAccount : userStore.user.account
    signatureAccounts.value = [{ ...current, email: current.email || userStore.user.email, name: current.name || userStore.user.name }]
  }
}

function setBody(html) {
  defValue.value = html
  editor.value.setContent(html)
  form.content = editor.value.getContent()
  // setContent is deferred until TinyMCE's init if necessary.
  if (!form.content && html) form.content = html
}

function rememberBody() {
  initialContent = editor.value.getContent()
  if (form.sendType === 'reply' || form.sendType === 'forward') {
    backReply.content = initialContent
    backReply.subject = form.subject
    backReply.receiveEmail = [...form.receiveEmail]
    backReply.cc = [...form.cc]
    backReply.sendType = form.sendType
  }
}

function editorReady() {
  if (rememberInitial) {
    form.signatureSnapshot = signatureSnapshot(editor.value.getContent())
    rememberBody()
    rememberInitial = false
  }
}

async function beginCompose(mode, email = null, all = false) {
  if (opening || show.value) { editor.value.focus(); return }
  opening = true
  try {
    await loadSignatures()
    resetForm()
    const preferred = signatureAccounts.value.find(a => a.accountId === email?.accountId)
      || signatureAccounts.value.find(a => a.accountId === accountStore.currentAccount.accountId)
      || signatureAccounts.value.find(a => a.email === userStore.user.email)
      || signatureAccounts.value[0]
    if (!preferred) return
    Object.assign(form, { sendEmail: preferred.email, name: preferred.name, accountId: preferred.accountId, sendType: mode })
    let content = '<div><br></div>'
    if (email) {
      const original = formatImage(email.content) || `<pre style="font-family: inherit;white-space: pre-wrap">${escapeHtml(email.text || '')}</pre>`
      if (mode === 'reply') {
        const recipients = replyRecipients(email, signatureAccounts.value.map(a => a.email), all)
        form.receiveEmail = recipients.to
        form.cc = recipients.cc
        showCc.value = form.cc.length > 0
        form.replyAll = all
        form.subject = /^(Re[:：]|回复[:：])/i.test(email.subject || '') ? email.subject : 'Re: ' + (email.subject || '')
        form.emailId = email.emailId
        content += `<div data-mitco-quote="1"><br><div>${escapeHtml(formatDetailDate(email.createTime))} ${escapeHtml(email.name || '')} &lt;${escapeHtml(email.sendEmail || '')}&gt; ${t('wrote')}:</div><blockquote class="mceNonEditable" style="margin: 0 0 0 0.8ex;border-left: 1px solid #ccc;padding-left: 1ex;">${original}</blockquote></div>`
      } else {
        form.subject = email.subject || ''
        content += `<div data-mitco-quote="1">${original}</div>`
      }
    }
    const result = updateSignature(content, preferred, mode)
    form.signatureSnapshot = result.snapshot
    show.value = true
    rememberInitial = true
    setBody(result.html)
    await nextTick()
    form.signatureSnapshot = signatureSnapshot(editor.value.getContent()) || result.snapshot
    rememberBody()
    if (editor.value.isReady()) rememberInitial = false
    editor.value.focus()
  } finally { opening = false }
}

function escapeHtml(value) {
  const el = document.createElement('div')
  el.textContent = value
  return el.innerHTML
}

function openForward(email) { return beginCompose('forward', email) }
function openReply(email, all = false) { return beginCompose('reply', email, all) }

async function replaceSignature(signature, force = false) {
  const html = editor.value.getContent()
  let result = updateSignature(html, signature, form.sendType, { snapshot: form.signatureSnapshot, force })
  if (result.edited) {
    try {
      await ElMessageBox.confirm(t('signatureReplaceEdited'), {
        confirmButtonText: t('signatureReplace'), cancelButtonText: t('signatureKeep'), type: 'warning'
      })
    } catch { return }
    result = updateSignature(html, signature, form.sendType, { snapshot: form.signatureSnapshot, force, replaceEdited: true })
  }
  setBody(result.html)
  form.signatureSnapshot = signatureSnapshot(editor.value.getContent()) || result.snapshot
}

async function changeSender(id) {
  const selected = signatureAccounts.value.find(a => a.accountId === id)
  if (!selected || senderChanging.value) return
  senderChanging.value = true
  try {
    await replaceSignature(selected)
    Object.assign(form, { accountId: id, sendEmail: selected.email, name: selected.name })
  } finally { senderChanging.value = false }
}

async function insertSignature() {
  if (senderChanging.value) return
  senderChanging.value = true
  try { await replaceSignature(activeSignature.value, true) } finally { senderChanging.value = false }
}

async function retrySignatures() {
  await loadSignatures()
  if (!signatureFailed.value) await replaceSignature(activeSignature.value)
}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function open() { return beginCompose('') }

async function openDraft(draft) {
  if (opening || show.value) { editor.value.focus(); return }
  opening = true
  try {
    await loadSignatures()
    resetForm()
    Object.assign(form, { ...draft, cc: [...(draft.cc || [])] })
    showCc.value = form.cc.length > 0
    // Preserve the draft byte-for-byte at the application level: never auto-insert here.
    show.value = true
    setBody(draft.content || '')
    editor.value.focus()
  } finally { opening = false }
}

const handleKeyDown = (event) => {
  if (event.key === 'Escape') {
    close()
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

function close() {
  if (senderChanging.value || !show.value) return

  if (selectStatus) openSelect();

  form.content = editor.value.getContent();

  if (form.draftId) {
    draftStore.setDraft = {...toRaw(form)}
    show.value = false
    resetForm()
    return;
  }

  if (!form.sendType && form.content === initialContent && !form.subject && !form.receiveEmail.length && !form.cc.length && !form.attachments.length) {
    show.value = false
    resetForm()
    return
  }

  if (!(form.content || form.subject || form.receiveEmail.length > 0 || form.cc.length > 0)) {
    show.value = false
    resetForm()
    return;
  }

  if (backReply.sendType === 'reply' || backReply.sendType === 'forward') {
    let subjectFlag = form.subject === backReply.subject
    let contentFlag = editor.value.getContent() === backReply.content
    let receiveFlag = JSON.stringify(form.receiveEmail) === JSON.stringify(backReply.receiveEmail)
        && JSON.stringify(form.cc) === JSON.stringify(backReply.cc)
    if (backReply.sendType === 'forward' && form.receiveEmail.length === 0 && form.cc.length === 0) {
      receiveFlag = true;
    }
    if (subjectFlag && contentFlag && receiveFlag) {
      resetForm();
      close()
      return;
    }
  }

  ElMessageBox.confirm(t('saveDraftConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning',
    distinguishCancelAndClose: true
  }).then(async () => {
    const formData = {...toRaw(form)};
    delete formData.draftId
    delete formData.attachments
    formData.createTime = dayjs().utc().format('YYYY-MM-DD HH:mm:ss');
    const draftId = await db.value.draft.add({...formData})
    db.value.att.add({draftId, attachments: toRaw(form.attachments)})
    draftStore.refreshList++
    show.value = false
    await nextTick(() => {
      resetForm()
    })
  }).catch((action) => {
    if (action === 'cancel') {
      show.value = false
      resetForm()
    }
  })

}

</script>
<style>

.send-size-error {
  width: min(480px, calc(100vw - 32px));
  max-width: calc(100vw - 32px);
}

.send-size-error a {
  color: var(--el-color-primary);
  text-decoration: underline;
}

.write-select .el-select-dropdown__list {
  padding: 4px 4px !important;
}
.write-select .el-select-dropdown__item {
  padding: 0 10px 0 10px;
}

.write-select .el-select-dropdown {
  min-width: 0 !important;
}
</style>
<style scoped lang="scss">
.send {
  z-index: 1000;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  .write-box {
    background: var(--el-bg-color);
    width: min(1367px, calc(100% - 80px));
    box-shadow: var(--el-box-shadow-light);
    border: 1px solid var(--el-border-color-light);
    transition: var(--el-transition-duration);
    padding: 15px;
    border-radius: 8px;
    display: grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
    @media (max-width: 1024px) {
      width: 100%;
      height: 100%;
      border-radius: 0;
      border: 0;
      padding-top: 10px;
    }

    @media (min-width: 1025px) {
      height: min(800px, calc(100vh - 60px));
    }

    .title {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;

      .compose-close { background: none; border: 0; color: inherit; cursor: pointer; padding: 4px; }

      .title-left .sender-select {
        width: 100%;
        max-width: 340px;
        min-width: 0;
        flex: 1;
        margin-left: 8px;
      }

      .title-left {
        min-width: 0;
        flex: 1;
        margin-right: 12px;
        align-items: center;
        display: grid;
        grid-template-columns: auto auto minmax(0, 1fr);
      }

      .title-text {
      }

      .sender {
        margin-left: 8px;
      }

      .sender-name {
        margin-left: 8px;
        font-weight: bold;
      }

      .send-email {
        color: #999896;
        margin-left: 5px;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }



    }

    .container {
      min-width: 0;
      grid-template-columns: minmax(0, 1fr);
      height: 100%;
      display: grid;
      grid-template-rows: auto auto 1fr auto auto;
      &.has-cc {
        grid-template-rows: auto auto auto 1fr auto auto;
      }
      &.signature-error { grid-template-rows: auto auto auto 1fr auto auto; }
      &.has-cc.signature-error { grid-template-rows: auto auto auto auto 1fr auto auto; }
      gap: 15px;

      .attachment-hint {
        margin: 0;
        color: var(--el-text-color-regular);
        font-size: 13px;
        line-height: 1.5;

        a {
          color: var(--el-color-primary);
          text-decoration: underline;
        }
      }

      .item-title {
      }

      .button-item {
        display: grid;
        grid-template-columns: auto auto auto minmax(0, 1fr) auto;
        align-items: center;
        column-gap: 8px;

        .att-add {
          cursor: pointer;
        }

        .att-clear {
          cursor: pointer;
          margin-left: 10px;
        }

        .att-list {
          display: grid;
          gap: 5px;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          padding-left: 10px;
          padding-right: 10px;
          max-height: 110px;
          overflow-y: auto;
          @media (max-width: 450px) {
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          }

          .att-item {
            display: grid;
            grid-template-columns: auto 1fr auto auto;
            gap: 5px;
            height: 32px;
            font-size: 14px;
            padding: 4px 5px;
            background: var(--light-ill);
            border-radius: 4px;
            .att-filename {
              white-space: nowrap;
              text-overflow: ellipsis;
              overflow: hidden;
            }
          }
        }
      }
    }
  }

}

.email-row {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.el-dialog) {
  width: 420px !important;
  @media (max-width: 460px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.contacts-bottom {
  display: flex;
  justify-content: end;
  margin-top: 10px;
}

.add-contact {
  color: var(--regular-text-color)
}

.write-select {
  position: absolute;
  width: 300px;
  left: 60px;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
}

:deep(.el-input-tag__suffix) {
  padding-right: 4px;
}

.icon {
  cursor: pointer;
}
</style>
