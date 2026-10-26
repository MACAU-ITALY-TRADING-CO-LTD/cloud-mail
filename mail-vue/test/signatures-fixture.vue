<template><nav style="display:flex;flex-wrap:wrap;gap:12px;padding:12px"><button @click="writer.open()">New message</button><button @click="writer.openReply(original)">Reply message</button><button @click="writer.openReply(original,true)">Reply all message</button><button @click="writer.openForward(original)">Forward message</button><button @click="writer.openDraft(draft())">Restore draft</button><router-link to="/">Settings</router-link><router-link to="/away">Away</router-link></nav><main style="padding:24px"><router-view /></main><Writer ref="writer" /></template>
<script setup>
import { ref } from "vue";
import Writer from "../src/layout/write/index.vue";
import { useUiStore } from "../src/store/ui.js";

    const writer = ref(null);
    const original = { accountId: 1, emailId: 91, subject: 'Original subject', text: 'Original message', content: '<p>Original message</p><div data-mitco-signature="1">Original sender signature</div>', createTime: '2026-10-26 01:00:00', sendEmail: 'outside@example.test', name: 'Original sender', toEmail: 'alice@example.test', recipient: ['alice@example.test'] };
    window.signatureTest = { writer, useUiStore, draft: null };
const draft = () => window.signatureTest.draft;

</script>