<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useAppStore } from '../store/app';
import { usePaged } from '../composables/usePaged';
import { NavBar, Card } from './ui';
import { Popup as VanPopup, showToast, showConfirmDialog, Switch as VanSwitch } from 'vant';
import {
  Plus, Trash2, Edit3, Users, UserCircle, Dumbbell, Stethoscope, Leaf,
  Phone, Search, X, Settings2, UserPlus, ShieldCheck, ShieldOff, LockKeyhole,
} from 'lucide-vue-next';
import type { Account, Camp, Role } from '../types';

const store = useAppStore();

// ─── Tab 切换 ───
const activeTab = ref<Role>('student');
const isPlatformAdmin = computed(() => store.user?.adminLevel === 'platform' || store.user?.supervisor === true);
const myAccount = computed(() =>
  store.accounts.find((a) => a.id === store.user?.id || a.phone === store.user?.phone),
);
const visibleCamps = computed(() => {
  if (isPlatformAdmin.value) return store.camps;
  return store.getAccessibleCamps();
});
const scopedAccounts = computed(() => {
  if (isPlatformAdmin.value) return store.accounts;
  return store.getOrganizationAccounts();
});
const permissionLabel = computed(() => {
  if (store.user?.adminLevel === 'platform' || store.user?.supervisor) return '一级管理 · 国际医院平台';
  if (store.user?.adminLevel === 'org') return '二级操作 · 医院/机构';
  return '仅个人工作台权限';
});
const tabs: { role: Role; label: string; icon: typeof Users; color: string }[] = [
  { role: 'student', label: '学员', icon: UserCircle, color: '#0B5FD7' },
  { role: 'coach', label: '康复师', icon: Dumbbell, color: '#FF976A' },
  { role: 'doctor', label: '医师', icon: Stethoscope, color: '#0948A8' },
  { role: 'dietitian', label: '营养师', icon: Leaf, color: '#1677FF' },
];

const roleLabel = (role?: Role) =>
  role === 'coach' ? '运动康复师'
    : role === 'doctor' ? '医师'
    : role === 'dietitian' ? '营养师'
    : '学员';

const roleIcon = (role?: Role) =>
  role === 'coach' ? Dumbbell : role === 'doctor' ? Stethoscope : role === 'dietitian' ? Leaf : UserCircle;

// ─── 搜索 ───
const searchQuery = ref('');
const searchKeyword = computed(() => searchQuery.value.trim().toLowerCase());

// ─── 营期筛选（仅学员 tab 下展示） ───
const filterCampId = ref<string>('all'); // 'all' = 全部期

// ─── 营期管理弹窗 ───
const showCampModal = ref(false);
const editingCamp = ref<Partial<Camp> | null>(null);
const campFormError = ref('');

// ─── 账户编辑弹窗 ───
const showAccountModal = ref(false);
const editingAccount = ref<Partial<Account> | null>(null);
const accountFormError = ref('');

// ─── 计算属性 ───
const filteredAccounts = computed(() => {
  let list = scopedAccounts.value.filter((a) => a.role === activeTab.value);
  // 学员 tab 下按营期筛选
  if (activeTab.value === 'student' && filterCampId.value !== 'all') {
    list = list.filter((a) => a.campIds?.includes(filterCampId.value));
  }
  // 搜索
  if (searchKeyword.value) {
    list = list.filter(
      (a) =>
        a.name.toLowerCase().includes(searchKeyword.value) ||
        a.phone.includes(searchKeyword.value),
    );
  }
  return list;
});
// 账户列表分页：默认前 20，更多点「加载更多」；切 tab/营期/搜索时重置
const { items: pagedAccounts, hasMore, remaining, loadMore, reset: resetPagedAccounts } = usePaged(filteredAccounts, 20);
watch([activeTab, filterCampId, searchKeyword], () => resetPagedAccounts());

const roleCount = computed(() => ({
  student: scopedAccounts.value.filter((a) => a.role === 'student').length,
  coach: scopedAccounts.value.filter((a) => a.role === 'coach').length,
  doctor: scopedAccounts.value.filter((a) => a.role === 'doctor').length,
  dietitian: scopedAccounts.value.filter((a) => a.role === 'dietitian').length,
}));

const campNameMap = computed(() => {
  const map: Record<string, string> = {};
  store.camps.forEach((c) => (map[c.id] = c.name));
  return map;
});

// ─── 营期管理 ───
const handleEditCamp = (camp?: Camp) => {
  editingCamp.value = camp
    ? { ...camp }
    : {
        name: '',
        startDate: '',
        endDate: '',
        status: 'upcoming',
        organization: isPlatformAdmin.value
          ? (store.getCurrentOrganization() || store.getAccessibleHospitals()[0]?.id)
          : store.getCurrentOrganization(),
      };
  campFormError.value = '';
  showCampModal.value = true;
};

const handleDeleteCamp = (camp: Camp) => {
  const studentCount = store.accounts.filter(
    (a) => a.role === 'student' && a.campIds?.includes(camp.id),
  ).length;
  const msg = studentCount > 0
    ? `「${camp.name}」下有 ${studentCount} 名学员，删除后学员将移除该期关联。确定删除？`
    : `确定删除营期「${camp.name}」？`;
  showConfirmDialog({ title: '删除营期', message: msg })
    .then(() => {
      // 同时移除学员的 campId 关联
      store.accounts.forEach((a) => {
        if (a.campIds?.includes(camp.id)) {
          store.updateAccount(a.id, {
            campIds: a.campIds.filter((id) => id !== camp.id),
          });
        }
      });
      store.deleteCamp(camp.id);
      showToast('已删除');
      if (filterCampId.value === camp.id) filterCampId.value = 'all';
    })
    .catch(() => {});
};

const saveCamp = () => {
  if (!editingCamp.value) return;
  if (!editingCamp.value.name?.trim()) {
    campFormError.value = '请输入营期名称';
    return;
  }
  // 检查重名
  const dup = store.camps.find(
    (c) => c.name === editingCamp.value!.name.trim() && c.id !== editingCamp.value!.id,
  );
  if (dup) {
    campFormError.value = '已存在同名营期';
    return;
  }
  // 根据 startDate 自动推断 status
  let status = editingCamp.value.status || 'upcoming';
  if (editingCamp.value.startDate) {
    const now = new Date();
    const start = new Date(editingCamp.value.startDate);
    const end = editingCamp.value.endDate ? new Date(editingCamp.value.endDate) : null;
    if (end && now > end) status = 'ended';
    else if (now >= start) status = 'active';
    else status = 'upcoming';
  }

  if (editingCamp.value.id) {
    store.updateCamp(editingCamp.value.id, {
      name: editingCamp.value.name.trim(),
      startDate: editingCamp.value.startDate || undefined,
      endDate: editingCamp.value.endDate || undefined,
      status,
      organization: editingCamp.value.organization,
    });
  } else {
    const newCampId = `camp_${Date.now()}`;
    store.addCamp({
      id: newCampId,
      name: editingCamp.value.name.trim(),
      startDate: editingCamp.value.startDate || undefined,
      endDate: editingCamp.value.endDate || undefined,
      status,
      organization: isPlatformAdmin.value
        ? (editingCamp.value.organization || store.getCurrentOrganization() || store.camps[0]?.organization)
        : store.getCurrentOrganization(),
    });
    // 二级机构新开的营期自动归入本机构管理员负责范围，避免创建后不可见
    if (!isPlatformAdmin.value && myAccount.value) {
      store.updateAccount(myAccount.value.id, {
        campIds: [...(myAccount.value.campIds || []), newCampId],
      });
    }
  }
  showCampModal.value = false;
};

// ─── 账户管理 ───
const handleEditAccount = (account?: Account) => {
  editingAccount.value = account
    ? { ...account, campIds: [...(account.campIds || [])] }
    : {
        phone: '',
        name: '',
        role: activeTab.value,
        organization: store.getCurrentOrganization() || store.getAccessibleHospitals()[0]?.id || '',
        campIds: (activeTab.value === 'student' || activeTab.value === 'coach' || activeTab.value === 'doctor') ? [] : undefined,
        active: true,
        supervisor: false,
      };
  accountFormError.value = '';
  showAccountModal.value = true;
};

const handleDeleteAccount = (account: Account) => {
  const displayName = account.name || account.phone;
  showConfirmDialog({
    title: '删除账户',
    message: `确定删除「${displayName}」(${account.phone})？删除后该手机号将无法登录。`,
  })
    .then(() => {
      store.deleteAccount(account.id);
      showToast('已删除');
    })
    .catch(() => {});
};

const toggleActive = (account: Account) => {
  store.updateAccount(account.id, { active: !account.active });
  showToast(account.active ? '已禁用' : '已启用');
};

const saveAccount = () => {
  if (!editingAccount.value) return;
  const { phone, name, role, campIds, active } = editingAccount.value;
  // 运营总览权限：仅当前督导可授予/收回，且只对营养师账号有意义
  const canGrant = store.user?.supervisor === true || store.user?.adminLevel === 'platform';
  const supervisorFlag = role === 'dietitian' ? editingAccount.value.supervisor === true : false;

  if (!phone?.trim()) {
    accountFormError.value = '请输入手机号';
    return;
  }
  if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
    accountFormError.value = '请输入正确的手机号';
    return;
  }
  if (role === 'student' && (!campIds || campIds.length === 0)) {
    accountFormError.value = '学员至少关联一个营期';
    return;
  }

  // 检查手机号 + 角色唯一：同一手机号允许存在不同角色的账户（登录时按角色匹配）
  const dup = store.accounts.find(
    (a) => a.phone === phone.trim() && a.role === role && a.id !== editingAccount.value!.id,
  );
  if (dup) {
    // 同手机号同角色：把新选的营期追加到已有账户
    if (role === 'student' && campIds && campIds.length > 0) {
      const existingCamps = dup.campIds || [];
      const newCamps = campIds.filter((id) => !existingCamps.includes(id));
      if (newCamps.length === 0) {
        accountFormError.value = '该学员已关联所选全部营期，无需重复添加';
        return;
      }
      store.updateAccount(dup.id, {
        campIds: [...existingCamps, ...newCamps],
      });
      const campNames = newCamps.map((id) => store.camps.find((c) => c.id === id)?.name).filter(Boolean).join('、');
      const displayName = name?.trim() || phone.trim();
      showToast(`已将「${displayName}」添加到 ${campNames}`);
      showAccountModal.value = false;
      return;
    }
    // 非学员角色重复直接报错
    accountFormError.value = '该手机号已存在';
    return;
  }

  const now = new Date();
  const createdAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  if (editingAccount.value.id) {
    store.updateAccount(editingAccount.value.id, {
      phone: phone.trim(),
      name: name?.trim() || '',
      role,
      organization: isPlatformAdmin.value ? editingAccount.value.organization : store.getCurrentOrganization(),
      campIds: (role === 'student' || role === 'coach' || role === 'doctor') ? campIds : undefined,
      active,
      ...(canGrant ? { supervisor: supervisorFlag } : {}),
    });
  } else {
    store.addAccount({
      id: `u_${Date.now()}`,
      phone: phone.trim(),
      name: name?.trim() || '',
      role: role as Role,
      organization: editingAccount.value.organization
        || store.getCurrentOrganization()
        || store.getAccessibleHospitals()[0]?.id,
      campIds: (role === 'student' || role === 'coach' || role === 'doctor') ? campIds : undefined,
      active: active ?? true,
      supervisor: canGrant ? supervisorFlag : false,
      createdAt,
    });
  }
  showAccountModal.value = false;
  showToast({ message: editingAccount.value.id ? '已保存' : '账号已创建', position: 'top', duration: 2000 });
};

// ─── 辅助 ───
const maskPhone = (phone: string) => phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');

const statusLabel = (status: Camp['status']) => {
  const map: Record<Camp['status'], { text: string; color: string }> = {
    upcoming: { text: '未开始', color: 'bg-gray-100 text-gray-500' },
    active: { text: '进行中', color: 'bg-green-100 text-green-600' },
    ended: { text: '已结束', color: 'bg-gray-100 text-gray-400' },
  };
  return map[status];
};

const formatDate = (d?: string) => (d ? d.replace(/-/g, '/') : '—');

// 切换 tab 时重置营期筛选
const switchTab = (role: Role) => {
  activeTab.value = role;
  filterCampId.value = 'all';
  searchQuery.value = '';
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] relative">
    <NavBar title="账户管理" :on-back="store.goBack" />

    <div class="flex-1 p-4 space-y-4 pb-24">
      <!-- 说明 -->
      <div class="flex items-center justify-between rounded-xl border border-[#0B5FD7]/15 bg-white px-3 py-2.5">
        <div>
          <div class="text-[10px] text-gray-400">当前登录权限</div>
          <div class="mt-0.5 text-xs font-bold text-[#0B5FD7]">{{ permissionLabel }}</div>
        </div>
        <div class="text-right">
          <div class="text-[10px] text-gray-400">所属机构</div>
          <div class="mt-0.5 text-[11px] font-semibold text-gray-700">{{ store.user?.organization || '未设置' }}</div>
        </div>
      </div>
      <div class="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
        <ShieldCheck class="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div class="text-xs text-blue-700 leading-relaxed">
          只有配置了手机号的账户才能登录系统。学员需关联营期；医师、康复师、营养师仅可查看所负责营期的学员与记录。
        </div>
      </div>
      <div class="flex items-start gap-2 bg-white border border-gray-100 rounded-xl p-3">
        <Settings2 class="w-4 h-4 text-[#FF976A] shrink-0 mt-0.5" />
        <div class="flex-1 text-[11px] text-gray-500 leading-relaxed">
          分级管理：商城兑换、活动开关等平台规则由国际医院统一配置；医院/机构仅可配置本机构人员账号与开营批次。
          <button class="ml-1 font-bold text-[#0B5FD7]" @click="store.setCurrentView('permission-config')">配置团队权限 →</button>
        </div>
      </div>
      <div v-if="!isPlatformAdmin" class="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <LockKeyhole class="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
        <div class="text-[11px] leading-relaxed text-gray-500">
          当前为二级机构操作权限，只能看到本机构负责的营期与人员。积分兑换、小红花规则、活动总开关、兑付中心由北大国际医院一级平台统一配置，本账号不可修改。
        </div>
      </div>

      <!-- 营期管理 -->
      <div>
        <div class="flex items-center justify-between mb-2 px-1">
          <h3 class="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <Settings2 class="w-4 h-4 text-[#FF976A]" />
            营期管理
          </h3>
          <button
            class="text-xs text-[#FF976A] font-medium flex items-center gap-0.5 active:opacity-70"
            @click="handleEditCamp()"
          >
            <Plus class="w-3.5 h-3.5" /> 新增期
          </button>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          <Card
            v-for="camp in visibleCamps"
            :key="camp.id"
            class="p-3 shrink-0 w-36 cursor-pointer hover:shadow-md transition-shadow"
            @click="handleEditCamp(camp)"
          >
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-sm font-bold text-gray-900">{{ camp.name }}</span>
              <span :class="['text-[9px] font-medium px-1.5 py-0.5 rounded', statusLabel(camp.status).color]">
                {{ statusLabel(camp.status).text }}
              </span>
            </div>
            <div class="text-[10px] text-gray-500">
              {{ formatDate(camp.startDate) }} ~ {{ formatDate(camp.endDate) }}
            </div>
            <div class="text-[10px] text-gray-400 mt-1">
              {{ store.accounts.filter(a => a.role === 'student' && a.campIds?.includes(camp.id)).length }} 名学员
            </div>
          </Card>
          <div v-if="visibleCamps.length === 0" class="text-xs text-gray-400 py-4 text-center w-full">
            暂无营期，请先新增
          </div>
        </div>
      </div>

      <!-- 角色切换 Tab -->
      <div class="flex bg-white p-1 rounded-xl shadow-sm">
        <button
          v-for="tab in tabs"
          :key="tab.role"
          :class="[
            'flex-1 py-2 text-[13px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1',
            activeTab === tab.role ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-900',
          ]"
          :style="activeTab === tab.role ? `background-color: ${tab.color}` : ''"
          @click="switchTab(tab.role)"
        >
          <component :is="tab.icon" class="w-4 h-4" />
          {{ tab.label }}
          <span class="text-[10px] opacity-80">({{ roleCount[tab.role] }})</span>
        </button>
      </div>

      <!-- 营期筛选（仅学员 tab） -->
      <div v-if="activeTab === 'student'" class="flex gap-2 overflow-x-auto pb-1">
        <button
          :class="[
            'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            filterCampId === 'all' ? 'bg-[#0B5FD7] text-white' : 'bg-white text-gray-600 border border-gray-100',
          ]"
          @click="filterCampId = 'all'"
        >
          全部期
        </button>
        <button
          v-for="camp in visibleCamps"
          :key="camp.id"
          :class="[
            'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            filterCampId === camp.id ? 'bg-[#0B5FD7] text-white' : 'bg-white text-gray-600 border border-gray-100',
          ]"
          @click="filterCampId = camp.id"
        >
          {{ camp.name }}
        </button>
      </div>

      <!-- 搜索框 -->
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="`搜索${roleLabel(activeTab)}姓名或手机号`"
          class="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-100 rounded-xl text-sm shadow-sm focus:outline-none focus:border-[#FF976A] transition-colors"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 账户列表 -->
      <div class="space-y-3">
        <template v-if="filteredAccounts.length > 0">
          <Card
            v-for="account in pagedAccounts"
            :key="account.id"
            class="p-4 flex items-center justify-between border-0 shadow-sm"
          >
            <div class="flex items-start space-x-3 flex-1 min-w-0">
              <div
                :class="[
                  'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
                  activeTab === 'student' ? 'bg-[#0B5FD7]/10 text-[#0B5FD7]' :
                  activeTab === 'coach' ? 'bg-[#FF976A]/10 text-[#FF976A]' :
                  activeTab === 'doctor' ? 'bg-[#0948A8]/10 text-[#0948A8]' :
                  'bg-[#1677FF]/10 text-[#1677FF]',
                ]"
              >
                <component :is="roleIcon(activeTab)" class="w-6 h-6" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                  <span class="text-sm font-bold text-gray-900">{{ account.name || '未填写' }}</span>
                  <span v-if="!account.name" class="text-[9px] font-medium bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded">待问卷填写</span>
                  <span v-if="!account.active" class="text-[9px] font-medium bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <ShieldOff class="w-2.5 h-2.5" /> 已禁用
                  </span>
                  <span v-if="account.supervisor" class="text-[9px] font-medium bg-[#1F4E79]/10 text-[#1F4E79] px-1.5 py-0.5 rounded">运营总览权限</span>
                  <span v-if="account.adminLevel === 'platform'" class="text-[9px] font-medium bg-[#0B5FD7]/10 text-[#0B5FD7] px-1.5 py-0.5 rounded">一级平台</span>
                  <span v-else-if="account.adminLevel === 'org'" class="text-[9px] font-medium bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">二级机构</span>
                </div>
                <div class="text-[10px] text-gray-500 flex items-center gap-1 mb-1.5">
                  <Phone class="w-3 h-3" /> {{ maskPhone(account.phone) }}
                </div>
                <div v-if="account.organization" class="mb-1.5 text-[10px] text-gray-400">{{ account.organization }}</div>
                <!-- 学员营期标签 -->
                <div v-if="(account.role === 'student' || account.role === 'coach' || account.role === 'doctor') && account.campIds && account.campIds.length > 0" class="flex flex-wrap gap-1">
                  <span
                    v-for="campId in (account.campIds || []).filter((id) => visibleCamps.some((c) => c.id === id))"
                    :key="campId"
                    class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[#0B5FD7]/10 text-[#0B5FD7]"
                  >
                    {{ campNameMap[campId] || campId }}
                  </span>
                </div>
              </div>
            </div>
            <div class="flex gap-1.5 shrink-0 items-center">
              <button
                @click="toggleActive(account)"
                :class="['p-1.5 rounded-lg transition-colors', account.active ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50']"
                :title="account.active ? '点击禁用' : '点击启用'"
              >
                <component :is="account.active ? ShieldCheck : ShieldOff" class="w-4 h-4" />
              </button>
              <button @click="handleEditAccount(account)" class="text-blue-500 p-1.5 hover:bg-blue-50 rounded-lg">
                <Edit3 class="w-4 h-4" />
              </button>
              <button @click="handleDeleteAccount(account)" class="text-red-500 p-1.5 hover:bg-red-50 rounded-lg">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </Card>
          <button v-if="hasMore" @click="loadMore" class="w-full py-2.5 mt-1 text-xs font-bold text-[#FF976A] bg-white border border-[#FF976A]/30 rounded-xl active:bg-orange-50">
            加载更多（还有 {{ remaining }} 个账户）
          </button>
        </template>
        <div v-else class="text-center text-xs text-gray-400 py-8 bg-white rounded-xl border border-gray-100">
          {{ searchKeyword ? `未找到匹配的${roleLabel(activeTab)}` : '暂无账户，请添加' }}
        </div>
      </div>
    </div>

    <!-- 底部新增按钮 -->
    <div class="sticky bottom-0 p-4 bg-white border-t border-gray-100">
      <button
        class="w-full py-3 rounded-xl text-white font-bold flex items-center justify-center gap-1"
        :style="`background-color: ${tabs.find(t => t.role === activeTab)?.color}`"
        @click="handleEditAccount()"
      >
        <UserPlus class="w-5 h-5" />
        新增{{ roleLabel(activeTab) }}
      </button>
    </div>

    <!-- 营期编辑弹窗 -->
    <VanPopup v-model:show="showCampModal" position="bottom" round :style="{ maxHeight: '90%' }">
      <div class="p-5 flex flex-col" style="max-height: 90vh;" v-if="editingCamp">
        <h3 class="text-lg font-bold text-gray-900 mb-5 shrink-0">{{ editingCamp.id ? '编辑营期' : '新增营期' }}</h3>
        <div class="space-y-4 mb-6 overflow-y-auto flex-1 min-h-0">
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">营期名称 <span class="text-red-500">*</span></label>
            <input
              type="text"
              placeholder="如：第一期"
              class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm"
              v-model="editingCamp.name"
              @input="campFormError = ''"
            />
          </div>
          <div v-if="isPlatformAdmin">
            <label class="text-sm font-medium text-gray-700 block mb-1">所属医院 <span class="text-red-500">*</span></label>
            <select
              v-model="editingCamp.organization"
              class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm"
            >
              <option v-for="h in store.getAccessibleHospitals()" :key="h.id" :value="h.id">{{ h.name }}</option>
            </select>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">开营日期</label>
            <input
              type="date"
              class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm"
              v-model="editingCamp.startDate"
            />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">结营日期</label>
            <input
              type="date"
              class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm"
              v-model="editingCamp.endDate"
            />
          </div>
          <div v-if="editingCamp.startDate" class="text-[10px] text-gray-400">
            状态将根据日期自动判断：开营前=未开始，开营~结营=进行中，结营后=已结束
          </div>
          <div v-if="campFormError" class="text-red-500 text-xs font-medium text-center">{{ campFormError }}</div>
        </div>
        <div class="flex gap-3 shrink-0">
          <button class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold" @click="showCampModal = false">取消</button>
          <button class="flex-[2] py-3 rounded-xl bg-[#FF976A] text-white font-bold" @click="saveCamp">保存</button>
        </div>
      </div>
    </VanPopup>

    <!-- 账户编辑弹窗 -->
    <VanPopup v-model:show="showAccountModal" position="bottom" round :style="{ maxHeight: '90%' }">
      <div class="p-5 flex flex-col" style="max-height: 90vh;" v-if="editingAccount">
        <h3 class="text-lg font-bold text-gray-900 mb-5 shrink-0">
          {{ editingAccount.id ? '编辑账户' : '新增' + roleLabel(editingAccount.role) }}
        </h3>
        <div class="space-y-4 mb-6 overflow-y-auto flex-1 min-h-0">
          <!-- 手机号 -->
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">手机号 <span class="text-red-500">*</span></label>
            <input
              type="tel"
              maxlength="11"
              placeholder="请输入11位手机号"
              class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm tracking-wider"
              v-model="editingAccount.phone"
              @input="editingAccount.phone = editingAccount.phone!.replace(/\D/g, ''); accountFormError = ''"
            />
            <div class="text-[10px] text-gray-400 mt-1">手机号是登录系统的唯一凭证，不可重复</div>
          </div>
          <!-- 姓名 -->
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">姓名 <span class="text-gray-400 text-xs">(选填，学员可在问卷中自行填写)</span></label>
            <input
              type="text"
              placeholder="留空则由学员首次问卷时填写"
              class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm"
              v-model="editingAccount.name"
              @input="accountFormError = ''"
            />
          </div>
          <!-- 所属医院：团队权限跟随医院，不允许跨院归属 -->
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">所属医院</label>
            <select
              v-if="isPlatformAdmin"
              v-model="editingAccount.organization"
              class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm"
            >
              <option v-for="h in store.getAccessibleHospitals()" :key="h.id" :value="h.id">{{ h.name }}</option>
            </select>
            <div v-else class="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-[#0B5FD7]">
              {{ store.getCurrentOrganization() }}（二级账号固定本院）
            </div>
            <div class="mt-1 text-[10px] text-gray-400">团队权限跟随医院，不能跨院查看数据</div>
          </div>
          <!-- 角色选择（新增时可切换） -->
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">角色 <span class="text-red-500">*</span></label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="tab in tabs"
                :key="tab.role"
                type="button"
                :class="[
                  'flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 border',
                  editingAccount.role === tab.role
                    ? 'text-white border-transparent'
                    : 'bg-gray-50 text-gray-600 border-gray-200 active:bg-gray-100',
                ]"
                :style="editingAccount.role === tab.role ? `background-color: ${tab.color}` : ''"
                @click="editingAccount.role = tab.role; accountFormError = ''"
              >
                <component :is="tab.icon" class="w-4 h-4" />
                {{ tab.label }}
              </button>
            </div>
          </div>
          <!-- 营期关联（学员/康复师/医师） -->
          <div v-if="editingAccount.role === 'student' || editingAccount.role === 'coach' || editingAccount.role === 'doctor'">
            <label class="text-sm font-medium text-gray-700 block mb-2">{{ editingAccount.role === 'student' ? '所属营期' : '负责营期' }} <span v-if="editingAccount.role === 'student'" class="text-red-500">*</span></label>
            <div v-if="visibleCamps.length === 0" class="text-xs text-orange-500 bg-orange-50 rounded-lg p-2.5">
              暂无营期，请先在上方新增营期
            </div>
            <div v-else class="flex flex-wrap gap-2">
              <button
                v-for="camp in visibleCamps"
                :key="camp.id"
                type="button"
                :class="[
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
                  (editingAccount.campIds || []).includes(camp.id)
                    ? 'bg-[#0B5FD7] text-white border-transparent'
                    : 'bg-gray-50 text-gray-600 border-gray-200 active:bg-gray-100',
                ]"
                @click="
                  () => {
                    const ids = editingAccount!.campIds || [];
                    if (ids.includes(camp.id)) {
                      editingAccount!.campIds = ids.filter((id) => id !== camp.id);
                    } else {
                      editingAccount!.campIds = [...ids, camp.id];
                    }
                    accountFormError = '';
                  }
                "
              >
                {{ camp.name }}
              </button>
            </div>
            <div class="text-[10px] text-gray-400 mt-1.5">
              {{ editingAccount.role === 'student' ? '可多选，同一人可参与多期；每期排名相互独立' : editingAccount.role === 'doctor' ? '可多选，医师仅可查看所负责营期的患者与随访记录' : '可多选，不选则负责全部营期；发布活动时仅可选负责的营期' }}
            </div>
          </div>
          <!-- 启用状态 -->
          <div class="flex items-center justify-between bg-gray-50 rounded-lg p-3">
            <div>
              <div class="text-sm font-medium text-gray-700">启用状态</div>
              <div class="text-[10px] text-gray-400 mt-0.5">禁用后该手机号将无法登录</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold" :class="editingAccount.active ? 'text-[#0B5FD7]' : 'text-gray-400'">
                {{ editingAccount.active ? '已启用' : '已禁用' }}
              </span>
              <VanSwitch
                :model-value="editingAccount.active"
                @update:model-value="editingAccount.active = $event"
                size="22px"
                active-color="#0B5FD7"
              />
            </div>
          </div>
          <!-- 运营总览权限：仅督导本人可授予，且只对营养师账号展示 -->
          <div v-if="store.user?.supervisor && editingAccount.role === 'dietitian'" class="flex items-center justify-between bg-[#1F4E79]/5 rounded-lg p-3 border border-[#1F4E79]/10">
            <div>
              <div class="text-sm font-medium text-gray-700">运营总览权限</div>
              <div class="text-[10px] text-gray-400 mt-0.5">开启后可查看全部学员打卡与营养师/教练批注情况</div>
            </div>
            <VanSwitch
              :model-value="editingAccount.supervisor === true"
              @update:model-value="editingAccount.supervisor = $event"
              size="22px"
              active-color="#1F4E79"
            />
          </div>
          <div v-if="accountFormError" class="text-red-500 text-xs font-medium text-center">{{ accountFormError }}</div>
        </div>
        <div class="flex gap-3 shrink-0">
          <button class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold" @click="showAccountModal = false">取消</button>
          <button class="flex-[2] py-3 rounded-xl bg-[#FF976A] text-white font-bold" @click="saveAccount">保存</button>
        </div>
      </div>
    </VanPopup>
  </div>
</template>
