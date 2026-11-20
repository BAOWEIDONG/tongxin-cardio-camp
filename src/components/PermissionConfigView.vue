<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAppStore } from '../store/app';
import { NavBar, Card } from './ui';
import { showToast, Switch as VanSwitch } from 'vant';
import { CheckCheck, ChevronDown, LockKeyhole, RotateCcw, Save, ShieldCheck, Users } from 'lucide-vue-next';
import { PERMISSION_GROUPS, PLATFORM_ONLY_PERMISSIONS } from '../lib/permissions';
import type { Role } from '../types';

const store = useAppStore();
const isPlatform = computed(() => store.isPlatformAdminUser());
const hospitalOptions = computed(() => store.getAccessibleHospitals());
const selectedHospital = ref(isPlatform.value ? (hospitalOptions.value[0]?.id || '') : store.getCurrentOrganization());
const selectedRole = ref<Role>('student');
const draft = ref<string[]>([]);
const collapsed = ref<Record<string, boolean>>({});

const roleTabs: { role: Role; label: string; desc: string }[] = [
  { role: 'student', label: '学员', desc: '健康首页与打卡入口' },
  { role: 'coach', label: '运动康复师', desc: '运动评估与处方提交' },
  { role: 'doctor', label: '医师', desc: '患者、随访与处方签署' },
  { role: 'dietitian', label: '营养师', desc: '饮食、体重与营养随访' },
];

function load() {
  if (!selectedHospital.value) return;
  draft.value = [...store.getHospitalPermissionTemplate(selectedHospital.value, selectedRole.value)];
}
watch([selectedHospital, selectedRole], load, { immediate: true });

const lockPlatform = computed(() => !isPlatform.value);
const availableGroups = computed(() => PERMISSION_GROUPS.map((g) => ({
  ...g,
  items: g.items.map((item) => ({
    ...item,
    locked: lockPlatform.value && PLATFORM_ONLY_PERMISSIONS.has(item.key),
  })),
})));

function checked(key: string) {
  return draft.value.includes(key);
}
function toggle(key: string) {
  const item = PERMISSION_GROUPS.flatMap((g) => g.items).find((x) => x.key === key);
  if (lockPlatform.value && item && PLATFORM_ONLY_PERMISSIONS.has(key)) {
    showToast('该权限由集团一级管理员统一配置');
    return;
  }
  draft.value = checked(key) ? draft.value.filter((x) => x !== key) : [...draft.value, key];
}
function selectGroup(groupKey: string, checkedValue: boolean) {
  const group = PERMISSION_GROUPS.find((g) => g.key === groupKey);
  if (!group) return;
  const keys = group.items
    .filter((i) => !(lockPlatform.value && PLATFORM_ONLY_PERMISSIONS.has(i.key)))
    .map((i) => i.key);
  if (checkedValue) draft.value = Array.from(new Set([...draft.value, ...keys]));
  else draft.value = draft.value.filter((k) => !keys.includes(k));
}
function selectAll() {
  const keys = PERMISSION_GROUPS.flatMap((g) => g.items)
    .filter((i) => !(lockPlatform.value && PLATFORM_ONLY_PERMISSIONS.has(i.key)))
    .map((i) => i.key);
  draft.value = keys;
}
function clearAll() {
  draft.value = draft.value.filter((k) => lockPlatform.value && PLATFORM_ONLY_PERMISSIONS.has(k));
}
function resetDefault() {
  draft.value = [...store.getHospitalPermissionTemplate(selectedHospital.value, selectedRole.value)];
  showToast('已恢复为上次保存的配置');
}
function save() {
  if (!selectedHospital.value) {
    showToast('请选择医院');
    return;
  }
  const ok = store.setHospitalPermissionTemplate(selectedHospital.value, selectedRole.value, draft.value);
  if (!ok) {
    showToast('无权限修改该医院配置');
    return;
  }
  showToast({ message: '权限已保存，团队成员重新登录或刷新后生效', position: 'top' });
}

const counts = computed(() => ({
  menu: draft.value.filter((k) => k.startsWith('menu.')).length,
  action: draft.value.filter((k) => k.startsWith('action.')).length,
}));

const orgMembers = computed(() =>
  store.accounts.filter((a) => a.organization === selectedHospital.value && a.role === selectedRole.value && a.active),
);
</script>

<template>
  <div class="min-h-full bg-[#F4F7FB] pb-24">
    <NavBar title="权限配置" :on-back="store.goBack">
      <template #right>
        <button class="flex items-center gap-1 rounded-full bg-[#0B5FD7] px-3 py-1.5 text-[11px] font-bold text-white" @click="save">
          <Save class="h-3.5 w-3.5" />保存
        </button>
      </template>
    </NavBar>

    <div class="space-y-4 p-4">
      <div class="rounded-2xl bg-gradient-to-br from-[#0B5FD7] to-[#084C9E] p-4 text-white">
        <div class="flex items-center gap-2 text-xs font-bold">
          <ShieldCheck class="h-4 w-4" />
          {{ isPlatform ? '集团一级权限配置' : '医院二级权限配置' }}
        </div>
        <p class="mt-2 text-[11px] leading-relaxed text-blue-100">
          权限按“医院 + 角色模板”下发，同时控制菜单入口和关键操作。团队成员随医院归属，不能跨院查看或操作。
        </p>
      </div>

      <Card class="p-4">
        <div class="mb-2 text-[11px] font-bold text-gray-500">适用医院</div>
        <div v-if="isPlatform" class="relative">
          <select v-model="selectedHospital" class="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold text-gray-900 outline-none">
            <option v-for="h in hospitalOptions" :key="h.id" :value="h.id">{{ h.name }}</option>
          </select>
          <ChevronDown class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
        <div v-else class="flex items-center justify-between rounded-xl bg-blue-50 px-3 py-3">
          <span class="text-sm font-bold text-[#0B5FD7]">{{ selectedHospital }}</span>
          <span class="text-[10px] text-[#0B5FD7]">仅本院</span>
        </div>
      </Card>

      <Card class="p-3">
        <div class="grid grid-cols-4 gap-1">
          <button
            v-for="tab in roleTabs"
            :key="tab.role"
            class="rounded-xl px-1 py-2.5 text-center transition-colors"
            :class="selectedRole === tab.role ? 'bg-[#0B5FD7] text-white' : 'text-gray-500'"
            @click="selectedRole = tab.role"
          >
            <div class="text-[11px] font-bold leading-tight">{{ tab.label }}</div>
          </button>
        </div>
        <div class="mt-2 border-t border-gray-50 pt-2 text-center text-[10px] text-gray-400">
          {{ roleTabs.find(r => r.role === selectedRole)?.desc }} · 当前 {{ orgMembers.length }} 名成员
        </div>
      </Card>

      <div class="flex items-center justify-between">
        <div class="text-[11px] text-gray-500">
          已选 <span class="font-bold text-[#0B5FD7]">{{ counts.menu }}</span> 个菜单 ·
          <span class="font-bold text-[#0B5FD7]">{{ counts.action }}</span> 个操作
        </div>
        <div class="flex gap-2">
          <button class="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#0B5FD7] shadow-sm" @click="selectAll">全选</button>
          <button class="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-gray-500 shadow-sm" @click="clearAll">清空</button>
          <button class="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-gray-500 shadow-sm" @click="resetDefault">
            <RotateCcw class="inline h-3 w-3" /> 撤回
          </button>
        </div>
      </div>

      <Card v-for="group in availableGroups" :key="group.key" class="overflow-hidden">
        <button class="flex w-full items-center gap-3 p-4 text-left" @click="collapsed[group.key] = !collapsed[group.key]">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B5FD7]/8 text-[#0B5FD7]">
            <Users class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-bold text-gray-900">{{ group.label }}</div>
            <div class="mt-0.5 text-[10px] text-gray-400">{{ group.desc }}</div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-gray-400">{{ group.items.filter(i => checked(i.key)).length }}/{{ group.items.length }}</span>
            <ChevronDown class="h-4 w-4 text-gray-400 transition-transform" :class="collapsed[group.key] ? '-rotate-90' : ''" />
          </div>
        </button>

        <div v-if="!collapsed[group.key]" class="border-t border-gray-50 px-4 pb-3">
          <div class="flex items-center justify-between border-b border-gray-50 py-2">
            <span class="text-[10px] text-gray-400">本组菜单与操作</span>
            <button class="flex items-center gap-1 text-[10px] font-bold text-[#0B5FD7]" @click="selectGroup(group.key, true)">
              <CheckCheck class="h-3 w-3" />本组全选
            </button>
          </div>
          <div
            v-for="item in group.items"
            :key="item.key"
            class="flex items-center gap-3 border-b border-gray-50 py-3 last:border-0"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                {{ item.label }}
                <LockKeyhole v-if="item.locked" class="h-3 w-3 text-gray-400" />
              </div>
              <div class="mt-0.5 text-[10px] leading-relaxed text-gray-400">
                {{ item.locked ? '集团一级管理员统一配置，医院端只读' : item.desc }}
              </div>
            </div>
            <VanSwitch
              :model-value="checked(item.key) || item.locked"
              :disabled="item.locked"
              size="20px"
              active-color="#0B5FD7"
              @update:model-value="() => toggle(item.key)"
            />
          </div>
        </div>
      </Card>

      <div class="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
        <p class="text-[10px] font-bold text-amber-700">权限说明</p>
        <p class="mt-1 text-[10px] leading-relaxed text-amber-700/80">
          保存后，该医院该角色新登录或刷新页面即按新权限生效。账号如设置了个别权限覆盖，以账号单独配置优先；演示版统一采用医院角色模板。
        </p>
      </div>
    </div>

    <div class="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-md border-t border-gray-100 bg-white p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <button class="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B5FD7] py-3 text-sm font-bold text-white active:opacity-90" @click="save">
        <Save class="h-4 w-4" />保存权限配置
      </button>
    </div>
  </div>
</template>
