<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar } from './ui';
import { AlertTriangle, HeartPulse, Send, ShieldCheck, Users } from 'lucide-vue-next';
import { showToast } from 'vant';

const store = useAppStore();
const input = ref('');
const listRef = ref<HTMLElement | null>(null);

const thread = computed(() => store.getChatThread(store.selectedChatThreadId));
const me = computed(() => store.user);
const isStudent = computed(() => me.value?.role === 'student');

const roleMeta = (role: string) => {
  if (role === 'doctor') return { label: '医师', cls: 'bg-blue-50 text-[#0B5FD7]', avatar: 'bg-[#0B5FD7]' };
  if (role === 'coach') return { label: '运动康复师', cls: 'bg-orange-50 text-orange-600', avatar: 'bg-[#FF976A]' };
  if (role === 'dietitian') return { label: '营养师', cls: 'bg-emerald-50 text-emerald-600', avatar: 'bg-[#18A058]' };
  return { label: '学员', cls: 'bg-gray-100 text-gray-500', avatar: 'bg-gray-400' };
};

const staffMembers = computed(() => thread.value?.members.filter((m) => m.role !== 'student') || []);
const quickReplies = computed(() => {
  if (isStudent.value) {
    return ['今天晨起血压 132/84，没有不适', '运动后有点胸闷，已停止休息', '今天已按时服药'];
  }
  if (me.value?.role === 'doctor') {
    return ['先静坐 5 分钟后复测血压，再把数值发来', '暂停中高强度运动，等待团队复核', '如胸痛持续或伴晕厥，请立即拨打 120'];
  }
  if (me.value?.role === 'coach') {
    return ['今天按 RPE 11–13 完成，能完整说句子', '热身和放松各 5 分钟，不要突然停下', '不适时立即停止并告知团队'];
  }
  return ['晚餐少盐，酱料和加工肉先暂停', '他汀期间不要大量喝西柚汁', '绿叶菜保持稳定，不要突然大幅增减'];
});

function scrollBottom() {
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
  });
}

function send(text?: string) {
  if (!thread.value) return;
  if (!store.hasPermission('action.send_message')) {
    showToast('当前账号为随访只读权限，不能发送消息');
    return;
  }
  const value = (text ?? input.value).trim();
  if (!value) return;
  store.sendChatMessage(thread.value.id, value);
  input.value = '';
  scrollBottom();
  if (isStudent.value) {
    window.setTimeout(() => {
      store.sendDemoTeamReply(thread.value!.id);
      scrollBottom();
    }, 1100);
  }
}

watch(() => thread.value?.id, (id) => {
  if (id) store.markChatRead(id);
  scrollBottom();
}, { immediate: true });

watch(() => thread.value?.messages.length, () => {
  if (thread.value) store.markChatRead(thread.value.id);
  scrollBottom();
});

if (!thread.value) {
  showToast('该会话不在您的负责范围');
}
</script>

<template>
  <div class="flex min-h-[100dvh] flex-col bg-[#F3F6FA]">
    <NavBar title="团队随访" :on-back="store.goBack" />

    <template v-if="thread">
      <div class="bg-white px-4 pb-3 pt-1 border-b border-gray-100">
        <div class="flex items-start gap-3">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0B5FD7] text-white shadow-sm">
            <HeartPulse class="h-5 w-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-base font-bold text-gray-900">{{ thread.title }}</h2>
              <span class="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-600">随访留痕</span>
            </div>
            <p class="mt-1 text-[11px] text-gray-500">{{ thread.topic }}</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="m in staffMembers" :key="m.id" :class="['rounded-full px-2 py-0.5 text-[9px] font-bold', roleMeta(m.role).cls]">
                {{ m.name }} · {{ roleMeta(m.role).label }}
              </span>
            </div>
          </div>
        </div>
        <div class="mt-3 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
          <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p class="text-[10px] leading-relaxed text-amber-700">
            本通道用于团队在线随访，不是急诊。胸痛持续、晕厥、严重气短或血压 ≥180/110 时，请立即拨打 120 或到院。
          </p>
        </div>
      </div>

      <div ref="listRef" class="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div class="flex justify-center">
          <span class="rounded-full bg-white px-3 py-1 text-[9px] text-gray-400 shadow-sm">
            医师、康复师、营养师与学员共同可见
          </span>
        </div>

        <div v-for="m in thread.messages" :key="m.id">
          <div v-if="m.kind === 'system' || m.kind === 'alert' || m.senderRole === 'system'"
            :class="['mx-auto max-w-[92%] rounded-xl border px-3 py-2 text-center text-[10px] leading-relaxed', m.kind === 'alert' ? 'border-red-100 bg-red-50 text-red-600' : 'border-blue-100 bg-blue-50/80 text-[#0B5FD7]']">
            {{ m.text }}
          </div>
          <div v-else :class="['flex gap-2', m.senderId === me?.id ? 'flex-row-reverse' : '']">
            <div :class="['mt-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white', m.senderId === me?.id ? 'bg-gray-500' : roleMeta(m.senderRole).avatar]">
              {{ m.senderName.slice(0, 1) }}
            </div>
            <div :class="['max-w-[78%]', m.senderId === me?.id ? 'items-end' : 'items-start', 'flex flex-col']">
              <div class="mb-1 flex items-center gap-1.5 px-1">
                <span class="text-[9px] text-gray-400">{{ m.senderName }}</span>
                <span v-if="m.senderId !== me?.id" :class="['rounded-full px-1.5 py-0.5 text-[8px] font-bold', roleMeta(m.senderRole).cls]">{{ roleMeta(m.senderRole).label }}</span>
              </div>
              <div :class="['rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm', m.senderId === me?.id ? 'rounded-br-md bg-[#0B5FD7] text-white' : 'rounded-bl-md bg-white text-gray-700']">
                {{ m.text }}
              </div>
              <span class="mt-0.5 px-1 text-[8px] text-gray-400">{{ m.date.slice(5, 16) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="store.hasPermission('action.send_message')" class="shrink-0 border-t border-gray-100 bg-white px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        <div class="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          <button v-for="q in quickReplies" :key="q" class="shrink-0 rounded-full border border-[#0B5FD7]/20 bg-blue-50 px-2.5 py-1 text-[9px] text-[#0B5FD7] active:scale-95" @click="send(q)">
            {{ q }}
          </button>
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="input"
            class="min-w-0 flex-1 rounded-full bg-[#F3F6FA] px-4 py-2.5 text-xs outline-none placeholder:text-gray-400"
            :placeholder="isStudent ? '描述血压、运动或不适情况' : '回复患者，说明复查与下一步安排'"
            @keyup.enter="send()"
          />
          <button class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B5FD7] text-white active:scale-95" @click="send()">
            <Send class="h-4 w-4" />
          </button>
        </div>
        <div class="mt-1.5 flex items-center justify-center gap-1 text-[9px] text-gray-400">
          <ShieldCheck class="h-3 w-3" /> 随访记录同步健康档案 · 互联网医院问诊需跳转第三方平台
        </div>
      </div>
      <div v-else class="shrink-0 border-t border-gray-100 bg-white px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-[11px] text-gray-400">
        当前账号仅有随访查看权限，不能发送消息
      </div>
    </template>

    <div v-else class="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <Users class="h-10 w-10 text-gray-300" />
      <p class="mt-3 text-sm font-bold text-gray-600">无法查看该随访会话</p>
      <p class="mt-1 text-xs text-gray-400">请确认患者属于您负责的营期</p>
    </div>
  </div>
</template>
