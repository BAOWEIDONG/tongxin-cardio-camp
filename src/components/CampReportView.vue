<script setup lang="ts">
import { computed, ref, watch, onActivated } from 'vue';
import { format } from 'date-fns';
import { useAppStore } from '../store/app';
import { campDateRange, campDaysOf, elapsedCampDays } from '../lib/camps';
import { NavBar, Card, StudentTabbar } from './ui';
import { TrendingDown, TrendingUp, Activity, Download, Lock, MessageCircle, Award, HeartPulse, ShieldCheck, Pill, Stethoscope } from 'lucide-vue-next';
import BadgeInfoPopup from './BadgeInfoPopup.vue';
import { Popup as VanPopup } from 'vant';
import { generateStudentReport, weightTrendToSvgPoints } from '../lib/campReport';
import { exportReport } from '../lib/exportPDF';
import type { StudentCampReport, MetricChange, BadgeConfig, BadgeRecord } from '../types';
import { questionnaireStorageKey } from '../store/app';

const store = useAppStore();

// 获取当前学员数据
const studentId = computed(() => store.user?.id || 's1');
const studentName = computed(() => store.user?.name || '学员');
const studentGender = computed(() => store.user?.gender);

// ─── 营期切换（学员可能在多个营期中） ───
const studentCamps = computed(() => store.getStudentCamps(studentId.value));
const selectedCampId = ref<string>('');
const showCampPicker = ref(false);
const selectedCamp = computed(() => studentCamps.value.find((c) => c.id === selectedCampId.value) || null);

// 初始化选中营期（优先 active，其次 ended）
watch(() => studentId.value, (id) => {
  if (id) {
    const camp = store.getStudentCamp(id);
    if (camp) selectedCampId.value = camp.id;
  }
}, { immediate: true });

// KeepAlive 再次进入时跟随首页当前营期，避免首页已切到第二期、报告仍停在第一期
onActivated(() => {
  const gid = store.selectedCampId;
  if (gid && studentCamps.value.some((c) => c.id === gid) && gid !== selectedCampId.value) {
    selectedCampId.value = gid;
  }
});

// 营期信息
const campInfo = computed(() => selectedCamp.value || store.getStudentCamp(studentId.value));
const campDays = computed(() => {
  if (campInfo.value?.startDate && campInfo.value?.endDate) {
    return campDaysOf(campInfo.value);
  }
  return store.getCampDays(studentId.value);
});
// 报告统计天数：进行中的营期按「开营到今天」计算，避免刚开营就用 28 天做分母（完成率 4%）
const reportDays = computed(() => elapsedCampDays(campInfo.value));
// 学员端结营报告不再上锁：营期未结束也可随时打开查看（数据为截至当前的累计）
const canView = computed(() => true);

// 按营期过滤打卡记录
const campDietRecords = computed(() => selectedCampId.value ? store.getCampDietRecords(selectedCampId.value) : store.dietRecords);
const campExerciseRecords = computed(() => selectedCampId.value ? store.getCampExerciseRecords(selectedCampId.value) : store.exerciseRecords);
const campWeightRecords = computed(() => selectedCampId.value ? store.getCampWeightRecords(selectedCampId.value) : store.weightRecords);
const homeBpRecords = computed(() => store.getStudentBpRecords(studentId.value, selectedCampId.value || undefined));
const homeBpDays = computed(() => new Set(homeBpRecords.value.map((r) => r.date.slice(0, 10))).size);

// 徽章墙：与「我的徽章」完全同源 —— 里程碑 + 成就 + 活动，全部读营养师配置与同一份获得记录
const badgeView = computed(() => {
  const cid = selectedCampId.value || campInfo.value?.id;
  if (!cid || !store.user) return { earned: [] as BadgeRecord[], activeConfigs: [] as BadgeConfig[], historical: [] as BadgeRecord[] };
  return store.getStudentBadgeView(store.user.id, cid);
});

const badgeWall = computed(() => {
  const { earned, activeConfigs, historical } = badgeView.value;
  const order = { milestone: 0, achievement: 1, activity: 2 } as const;
  const active = activeConfigs
    .slice()
    .sort((a, b) => order[a.category] - order[b.category])
    .map((c) => {
      const count = earned.filter((b) => b.badgeId === c.id).length;
      return {
        id: c.id,
        title: count > 1 ? `${c.name} ×${count}` : c.name,
        description: c.description || '',
        icon: c.icon,
        unlocked: count > 0,
      };
    });
  // 停用/删除后保留的历史徽章，同样展示，保证与「我的徽章」总数一致
  const hist = historical.map((r) => ({
    id: `h_${r.id}`,
    title: `${r.badgeName}（历史）`,
    description: '活动已停用，已获得徽章保留',
    icon: r.icon,
    unlocked: true,
  }));
  return [...active, ...hist].filter((item) => !/减重|减脂|燃脂/.test(item.title));
});
const unlockedAchievements = computed(() => badgeWall.value.filter((a) => a.unlocked));
const showBadgeInfo = ref(false);
const selectedBadgeCfg = ref<BadgeConfig | null>(null);
const selectedBadgeRecords = computed(() => {
  if (!selectedBadgeCfg.value) return [];
  return badgeView.value.earned.filter((b) => b.badgeId === selectedBadgeCfg.value!.id);
});
const openBadgeInfo = (item: { id: string }) => {
  const view = badgeView.value;
  let cfg: BadgeConfig | undefined = view.activeConfigs.find((c) => c.id === item.id);
  if (!cfg) {
    // 历史徽章：记录里已无对应生效配置，按记录构造只读说明
    const rec = view.historical.find((r) => `h_${r.id}` === item.id) || view.earned.find((r) => r.badgeId === item.id);
    if (!rec) return;
    cfg = {
      id: rec.badgeId, category: rec.category, name: rec.badgeName, cadence: rec.cadence,
      condition: 'checkin_days', threshold: 1, icon: rec.icon, active: false,
      description: '活动已停用，已获得徽章保留',
    };
  }
  selectedBadgeCfg.value = cfg;
  showBadgeInfo.value = true;
};

// 进入报告时按当前配置同步一次徽章
watch(
  () => campInfo.value?.id,
  (cid) => { if (cid) store.syncBadges(cid); },
  { immediate: true },
);

// 未读批注数（tabbar badge）
// 消息未读数（批注 + 系统通知，store 级统一，与各学员页「消息」Tab 角标一致）
const unreadCount = computed(() =>
  store.user?.role === 'student' ? store.getStudentMsgUnreadCount(store.user.id) : 0,
);

// 体重记录（当前学员，按营期过滤）
const studentWeights = computed(() =>
  campWeightRecords.value.filter((r) => r.studentId === studentId.value),
);

// 饮食记录（当前学员，按营期过滤）
const studentDiets = computed(() =>
  campDietRecords.value.filter((r) => r.studentId === studentId.value),
);

// 运动记录（当前学员，按营期过滤）
const studentExercises = computed(() =>
  campExerciseRecords.value.filter((r) => r.studentId === studentId.value),
);

// 生成结营报告
const report = computed<StudentCampReport>(() =>
  generateStudentReport(
    { id: studentId.value, name: studentName.value, gender: studentGender.value },
    store.metricConfigs,
    store.getEffectiveMetricValues(studentId.value, selectedCampId.value || campInfo.value?.id),
    studentDiets.value,
    studentExercises.value,
    studentWeights.value,
    reportDays.value,
  ),
);

// 体重趋势 SVG
const svgPoints = computed(() => weightTrendToSvgPoints(report.value.weightTrend, 280, 100, 20));

// 指标变化合并为单模块：体成分(身体测量数据) + 化验指标统一按分类分组展示。
// ① 无营前营后数据的指标一律不显示；② 分类名/指标名取自本期指标配置(config)，
//    配置里改了分类或名称这里自动同步；③ 组内排序：有前后值的排前面，改善的排前面。
const metricGroups = computed(() => {
  const groups = new Map<string, MetricChange[]>();
  for (const m of report.value.metricChanges) {
    if (m.beforeValue !== null || m.afterValue !== null) {
      if (!groups.has(m.category)) groups.set(m.category, []);
      groups.get(m.category)!.push(m);
    }
  }
  const categoryRank = (name: string) => {
    if (name.includes('心血管')) return 0;
    if (name.includes('血脂')) return 1;
    if (name.includes('血糖')) return 2;
    if (name.includes('身体测量')) return 9;
    return 5;
  };
  return Array.from(groups.entries()).sort(([a], [b]) => categoryRank(a) - categoryRank(b)).map(([cat, items]) => [
    cat,
    [...items].sort((a, b) => {
      const aHas = a.beforeValue !== null && a.afterValue !== null;
      const bHas = b.beforeValue !== null && b.afterValue !== null;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas && bHas && a.isImproved !== b.isImproved) return a.isImproved ? -1 : 1;
      return 0;
    }),
  ] as [string, MetricChange[]]);
});

/** 结营留言项：来源(寄语或某类批注)、作者角色、作者姓名、正文 */
interface ReportMessage {
  id: string;
  kind: '寄语' | '饮食批注' | '运动批注' | '体重批注';
  role: 'dietitian' | 'coach';
  name: string;
  text: string;
  time: string;
}

// 结营寄语留言列表（可能多名营养师各自撰写寄语，逐条展示带角色姓名，不互相覆盖）
const reportMessages = computed<ReportMessage[]>(() => {
  const sid = studentId.value;
  const cid = selectedCampId.value || campInfo.value?.id;
  const list: ReportMessage[] = [];
  // 结营寄语（campMessageList append 语义，可多条）；仅营养师可填写，教练寄语一律不展示
  if (cid) {
    store.getCampMessages(cid, sid).filter((m) => m.role === 'dietitian').forEach((m) => {
      list.push({
        id: m.id, kind: '寄语', role: m.role, name: m.authorName, text: m.text, time: m.createdAt,
      });
    });
  }
  // 按时间倒序（最新在前）
  return list.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
});

const roleTag = (m: ReportMessage) => (m.role === 'coach' ? { badge: '康复师', cls: 'bg-[#1677FF]/10 text-[#1677FF] border-[#1677FF]/20' } : { badge: '营养师', cls: 'bg-[#1677FF]/10 text-[#1677FF] border-[#1677FF]/20' });

// 「结营建议」已移除：结营寄语已足够，学员端报告不再展示结营建议。

// ─── 心血管慢病报告口径：血压、LDL-C、心率、同型半胱氨酸优先，体重仅作体液潴留参考 ───
const metricChange = (id: string) => report.value.metricChanges.find((m) => m.configId === id);
const metricNumber = (m?: MetricChange | null): number | null => {
  if (!m) return null;
  const value = m.afterValue ?? m.beforeValue;
  return typeof value === 'number' ? value : null;
};

const cardio = computed(() => {
  const sbp = metricChange('mc_cv_sbp');
  const dbp = metricChange('mc_cv_dbp');
  const ldl = metricChange('mc_bl_ldl');
  const hr = metricChange('mc_cv_hr');
  const hcy = metricChange('mc_cv_hcy');
  const sbpValue = metricNumber(sbp);
  const dbpValue = metricNumber(dbp);
  const ldlValue = metricNumber(ldl);
  const hrValue = metricNumber(hr);
  const hcyValue = metricNumber(hcy);
  const bpControlled = sbpValue !== null && dbpValue !== null && sbpValue < 130 && dbpValue < 80;
  const ldlControlled = ldlValue !== null && ldlValue < 2.6;
  return {
    sbp, dbp, ldl, hr, hcy,
    sbpValue, dbpValue, ldlValue, hrValue, hcyValue,
    bpControlled, ldlControlled,
    bpText: sbpValue !== null && dbpValue !== null ? `${sbpValue}/${dbpValue}` : '--',
    bpTarget: '一般管理目标 <130/80，最终由医师按危险分层确定',
    ldlTarget: '高危 <2.6；极高危 <1.8（由医师个体化确定）',
  };
});

const effectiveExerciseDays = computed(() => {
  const dates = new Set<string>();
  studentExercises.value.forEach((r) => {
    if (r.duration >= 20) dates.add(r.date.slice(0, 10));
  });
  return dates.size;
});
const averageRpe = computed(() => {
  if (studentExercises.value.length === 0) return null;
  const values = studentExercises.value.map((r) => r.intensity).filter((v) => Number.isFinite(v));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
});
const safetyStopEvents = computed(() =>
  studentExercises.value.filter((r) => /胸痛|胸闷|晕厥|气短|心悸|头晕|不适/.test(r.notes || '')).length,
);

const dietAdherence = computed(() => {
  const base = studentDiets.value;
  const rate = (key: 'lowSalt' | 'lowOil' | 'wholeGrain') => {
    const tagged = base.filter((r) => r[key] !== undefined);
    if (tagged.length === 0) return null;
    return tagged.filter((r) => r[key]).length / tagged.length;
  };
  const scored = base.filter((r) => typeof r.dietitianScore === 'number');
  const scoreFallback = scored.length ? scored.filter((r) => (r.dietitianScore ?? 0) >= 1).length / scored.length : null;
  return {
    lowSalt: rate('lowSalt') ?? scoreFallback,
    lowOil: rate('lowOil') ?? scoreFallback,
    wholeGrain: rate('wholeGrain') ?? scoreFallback,
  };
});

const teamThread = computed(() =>
  store.user?.id ? store.getStudentChatThread(store.user.id, selectedCampId.value || campInfo.value?.id) : null,
);
const activePrescription = computed(() =>
  store.user?.id ? store.getStudentPrescription(store.user.id, selectedCampId.value || campInfo.value?.id) : null,
);
const followupStats = computed(() => {
  const messages = teamThread.value?.messages || [];
  const staffMessages = messages.filter((m) => m.senderRole !== 'student' && m.senderRole !== 'system');
  return {
    total: messages.filter((m) => m.senderRole !== 'system').length,
    staff: staffMessages.length,
    doctor: staffMessages.filter((m) => m.senderRole === 'doctor').length,
    last: messages[messages.length - 1]?.date?.slice(0, 16) || '',
  };
});

const medicalInfo = computed(() => {
  try {
    const raw = localStorage.getItem(questionnaireStorageKey('submitted', studentId.value));
    const data = raw ? JSON.parse(raw) : null;
    const meds = data?.hasMedication && data.hasMedication !== '无'
      ? (data.medicationDetails || '已记录长期用药')
      : '暂未记录长期用药';
    return { meds, hasMedication: !!data?.hasMedication && data.hasMedication !== '无' };
  } catch {
    return { meds: '暂未记录长期用药', hasMedication: false };
  }
});

const bodyFluidWarning = computed(() => {
  const records = [...studentWeights.value].sort((a, b) => a.date.localeCompare(b.date));
  if (records.length < 2) return null;
  const latest = records[records.length - 1];
  const latestTime = new Date(latest.date.replace(/-/g, '/')).getTime();
  const weekAgo = records.filter((r) => latestTime - new Date(r.date.replace(/-/g, '/')).getTime() >= 0
    && latestTime - new Date(r.date.replace(/-/g, '/')).getTime() <= 7 * 86400000);
  if (weekAgo.length < 2) return null;
  const change = Number((latest.weight - weekAgo[0].weight).toFixed(1));
  if (change >= 2) {
    return { level: 'warning' as const, change, text: `近 7 天体重增加 ${change.toFixed(1)} kg，需关注水肿、气短和夜间憋醒，建议尽快联系团队复核。` };
  }
  return { level: 'normal' as const, change, text: `近 7 天体重变化 ${change > 0 ? '+' : ''}${change.toFixed(1)} kg，暂未见明显体液潴留信号。` };
});

const cardioConclusions = computed(() => {
  const cards: { title: string; text: string; good: boolean }[] = [];
  const c = cardio.value;
  cards.push({
    title: '血压控制',
    good: c.bpControlled,
    text: c.sbpValue === null
      ? '本期缺少完整血压数据，建议补充家庭血压记录后由医师复核。'
      : c.bpControlled
        ? `当前血压 ${c.bpText} mmHg，达到一般管理目标；仍需结合晨起血压和医师设定的个体目标继续观察。`
        : `当前血压 ${c.bpText} mmHg，尚未达到一般管理目标，请按医嘱监测并联系医师调整方案。`,
  });
  cards.push({
    title: '血脂管理',
    good: c.ldlControlled,
    text: c.ldlValue === null
      ? '本期缺少 LDL-C 数据，建议复查后由医师按危险分层设定目标。'
      : c.ldlControlled
        ? `LDL-C ${c.ldlValue.toFixed(2)} mmol/L，达到高危人群常用目标；极高危患者仍需按 <1.8 mmol/L 个体化评估。`
        : `LDL-C ${c.ldlValue.toFixed(2)} mmol/L，尚未达到常用高危目标，请勿自行停药并尽快与医师复核。`,
  });
  cards.push({
    title: '运动安全',
    good: safetyStopEvents.value === 0,
    text: safetyStopEvents.value === 0
      ? `累计 ${effectiveExerciseDays.value} 天有效运动（每次≥20 分钟），记录中未出现胸痛、晕厥或异常气短等停止信号。`
      : `记录到 ${safetyStopEvents.value} 次运动中不适/停止事件，需由医师复核后再调整强度。`,
  });
  cards.push({
    title: '随访与用药',
    good: followupStats.value.staff > 0,
    text: `团队随访 ${followupStats.value.staff} 次，其中医师 ${followupStats.value.doctor} 次。${medicalInfo.value.hasMedication ? '长期用药已记录，请按医嘱服用，不自行停药。' : '长期用药尚未完整记录，建议尽快补充。'}`,
  });
  return cards;
});

// 格式化
const fmt = (v: number | null, digits = 1): string => v === null ? '--' : v.toFixed(digits);
const fmtPct = (v: number | null): string => v === null ? '--' : `${(v * 100).toFixed(0)}%`;

/** 留言时间：yyyy-MM-dd HH:mm:ss → M月d日 HH:mm */
const formatMsgTime = (t: string): string => {
  if (!t) return '';
  const d = new Date(t.replace(/-/g, '/'));
  if (Number.isNaN(+d)) return t;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtChange = (v: number | null, unit = ''): string => {
  if (v === null) return '--';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}${unit ? ' ' + unit : ''}`;
};

// 指标变化展示文本
const metricChangeText = (m: MetricChange): string => {
  if (m.change === null) return '未检测';
  return fmtChange(m.change, m.unit);
};

// 指标变化颜色
const metricChangeColor = (m: MetricChange): string => {
  if (m.change === null) return 'text-gray-400';
  return m.isImproved ? 'text-[#0B5FD7]' : 'text-orange-500';
};

// 体重变化趋势箭头
const weightTrendIcon = computed(() => {
  if (report.value.weightTrend.trend === 'decreasing') return TrendingDown;
  if (report.value.weightTrend.trend === 'increasing') return TrendingUp;
  return Activity;
});

// 顶部摘要只讲心血管管理结果，不把减重作为主成就。
const encouragement = computed(() => {
  const name = studentName.value;
  const parts: string[] = [];
  if (cardio.value.sbpValue !== null) parts.push(`血压 ${cardio.value.bpText} mmHg`);
  if (cardio.value.ldlValue !== null) parts.push(`LDL-C ${cardio.value.ldlValue.toFixed(2)} mmol/L`);
  if (effectiveExerciseDays.value > 0) parts.push(`${effectiveExerciseDays.value} 天有效运动`);
  if (followupStats.value.staff > 0) parts.push(`团队随访 ${followupStats.value.staff} 次`);
  const summary = parts.length ? parts.join('，') : `累计打卡 ${report.value.summary.totalCheckinDays} 天`;
  return `${name}，本期心血管管理记录如下：${summary}。报告重点是风险控制和长期坚持，体重仅作体液潴留参考。`;
});

// ─── 导出（普通浏览器=PDF，微信=长图长按保存）───
const exportRef = ref<HTMLElement | null>(null);
const exportPDF = () => {
  if (exportRef.value) {
    exportReport(exportRef.value, `个人营期报告_${studentName.value}_${new Date().toISOString().split('T')[0]}`, true);
  }
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <NavBar title="个人营期报告" :on-back="store.goBack">
      <template #right>
        <button v-if="canView && store.hasPermission('action.export_report')" class="text-[#0B5FD7] hover:bg-blue-50 p-2 rounded-full transition-colors" @click="exportPDF">
          <Download class="h-5 w-5" />
        </button>
      </template>
    </NavBar>

    <!-- 营期切换（学员在多个营期时显示） -->
    <div v-if="studentCamps.length > 1" class="bg-white px-4 py-2.5 flex items-center justify-between border-b border-gray-100">
      <div>
        <span class="text-xs text-gray-500">当前营期：</span>
        <span class="text-sm font-medium text-gray-800">{{ selectedCamp?.name || '未选择' }}</span>
      </div>
      <button class="text-xs text-[#0B5FD7] border border-[#0B5FD7] px-2.5 py-1 rounded-full font-bold active:bg-blue-50" @click="showCampPicker = true">
        切换
      </button>
    </div>

    <!-- 营期未结束：显示锁定状态 -->
    <div v-if="!canView" class="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div class="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Lock class="w-10 h-10 text-gray-400" />
      </div>
      <h3 class="text-lg font-bold text-gray-700 mb-2">个人营期报告尚未生成</h3>
      <p class="text-sm text-gray-500 leading-relaxed">
        你的营期（{{ campInfo?.name || '当前期' }}）预计于
        <span class="font-medium text-gray-700">{{ campInfo?.endDate || '--' }}</span>
        结束，届时将自动生成个人营期报告。
      </p>
    </div>

    <!-- 营期已结束：显示完整报告 -->
    <div v-else ref="exportRef" class="p-4 space-y-4">
      <!-- 顶部鼓励卡片 -->
      <div class="bg-gradient-to-br from-[#0B5FD7] to-[#0948A8] rounded-2xl p-5 text-white shadow-lg">
        <div class="flex items-center gap-2 mb-3">
          <HeartPulse class="w-6 h-6" />
          <h2 class="text-lg font-bold">心血管健康营期报告</h2>
        </div>
        <p class="text-sm leading-relaxed opacity-95">{{ encouragement }}</p>
        <div class="flex gap-4 mt-4 text-center">
          <div class="flex-1 bg-white/15 rounded-lg py-2">
            <div class="text-xl font-bold">{{ cardio.bpText }}</div>
            <div class="text-[10px] opacity-80">血压 mmHg</div>
          </div>
          <div class="flex-1 bg-white/15 rounded-lg py-2">
            <div class="text-xl font-bold">{{ fmt(cardio.ldlValue, 2) }}</div>
            <div class="text-[10px] opacity-80">LDL-C mmol/L</div>
          </div>
          <div class="flex-1 bg-white/15 rounded-lg py-2">
            <div class="text-xl font-bold">{{ cardio.hrValue ?? '--' }}</div>
            <div class="text-[10px] opacity-80">静息心率</div>
          </div>
        </div>
      </div>

      <!-- 心血管核心指标：慢病人群最需要看的变化 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <HeartPulse class="h-4 w-4 text-[#0B5FD7]" />
          心血管核心指标
        </h3>
        <div class="space-y-3">
          <div class="rounded-xl border border-red-100 bg-red-50/50 p-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-gray-800">血压</span>
              <span :class="['rounded-full px-2 py-0.5 text-[9px] font-bold', cardio.bpControlled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700']">
                {{ cardio.bpControlled ? '达到一般目标' : '需继续管理' }}
              </span>
            </div>
            <div class="mt-2 flex items-end gap-2">
              <span class="text-2xl font-black text-gray-900">{{ cardio.bpText }}</span>
              <span class="pb-0.5 text-[10px] text-gray-400">mmHg</span>
              <span v-if="cardio.sbp?.change !== null && cardio.sbp?.change !== undefined" class="ml-auto pb-0.5 text-[10px] font-bold" :class="(cardio.sbp?.change ?? 0) < 0 ? 'text-emerald-600' : 'text-amber-600'">
                收缩压 {{ fmtChange(cardio.sbp?.change ?? null) }}
              </span>
            </div>
            <p class="mt-1.5 text-[10px] leading-relaxed text-gray-500">{{ cardio.bpTarget }}</p>
          </div>

          <div class="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-gray-800">LDL-C 低密度脂蛋白胆固醇</span>
              <span :class="['rounded-full px-2 py-0.5 text-[9px] font-bold', cardio.ldlControlled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700']">
                {{ cardio.ldlControlled ? '达到常用高危目标' : '未达常用目标' }}
              </span>
            </div>
            <div class="mt-2 flex items-end gap-2">
              <span class="text-2xl font-black text-gray-900">{{ fmt(cardio.ldlValue, 2) }}</span>
              <span class="pb-0.5 text-[10px] text-gray-400">mmol/L</span>
              <span v-if="cardio.ldl?.change !== null && cardio.ldl?.change !== undefined" class="ml-auto pb-0.5 text-[10px] font-bold" :class="(cardio.ldl?.change ?? 0) < 0 ? 'text-emerald-600' : 'text-amber-600'">
                {{ fmtChange(cardio.ldl?.change ?? null, 'mmol/L') }}
              </span>
            </div>
            <p class="mt-1.5 text-[10px] leading-relaxed text-gray-500">{{ cardio.ldlTarget }}</p>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="rounded-xl bg-gray-50 p-3">
              <div class="text-[10px] text-gray-400">静息心率</div>
              <div class="mt-1 text-lg font-bold text-gray-900">{{ cardio.hrValue ?? '--' }} <span class="text-[9px] font-normal text-gray-400">次/分</span></div>
              <div class="mt-1 text-[9px] text-gray-400">参考 60–100，结合用药判断</div>
            </div>
            <div class="rounded-xl bg-gray-50 p-3">
              <div class="text-[10px] text-gray-400">同型半胱氨酸</div>
              <div class="mt-1 text-lg font-bold text-gray-900">{{ fmt(cardio.hcyValue, 1) }} <span class="text-[9px] font-normal text-gray-400">μmol/L</span></div>
              <div class="mt-1 text-[9px] text-gray-400">参考 &lt;15，偏高需医师评估</div>
            </div>
          </div>
        </div>
      </Card>

      <!-- 家庭血压记录：门诊指标之外的居家过程数据 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <HeartPulse class="h-4 w-4 text-[#0B5FD7]" />
          家庭血压记录
          <span class="ml-auto text-[10px] font-normal text-gray-400">{{ homeBpDays }} 天 · {{ homeBpRecords.length }} 次</span>
        </h3>
        <div v-if="homeBpRecords.length" class="space-y-2">
          <div v-for="r in homeBpRecords.slice(0, 5)" :key="r.id" class="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
            <span class="text-[10px] text-gray-400">{{ r.date.slice(5, 16) }}</span>
            <span class="text-xs font-bold" :class="r.sbp >= 180 || r.dbp >= 110 ? 'text-red-600' : 'text-[#0B5FD7]'">{{ r.sbp }}/{{ r.dbp }} <span class="text-[9px] font-normal text-gray-400">mmHg</span></span>
            <span class="max-w-[42%] truncate text-[9px] text-gray-400">{{ r.note || '家庭自测' }}</span>
          </div>
          <p class="text-[9px] leading-relaxed text-gray-400">家庭血压用于观察趋势和用药反应，不能替代门诊诊断；持续偏高或伴胸痛、气短请及时联系团队。</p>
        </div>
        <div v-else class="rounded-xl bg-blue-50/60 px-3 py-2 text-[10px] text-gray-500">本营期尚无家庭血压记录，建议晨起、睡前各测一次并连续记录 7 天。</div>
      </Card>

      <!-- 徽章墙（里程碑 / 成就 / 活动，与「我的徽章」同源） -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <Award class="h-4 w-4 text-[#FF976A]" />
          徽章墙
          <span class="ml-auto text-xs text-gray-400 font-normal">已点亮 {{ unlockedAchievements.length }}/{{ badgeWall.length }} 种</span>
        </h3>
        <div class="grid grid-cols-4 gap-3">
          <div
            v-for="ach in badgeWall"
            :key="ach.id"
            class="flex flex-col items-center text-center cursor-pointer hover:scale-105 transition-transform"
            :class="ach.unlocked ? '' : 'opacity-30 grayscale'"
            @click="openBadgeInfo(ach)"
          >
            <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl mb-1"
              :class="ach.unlocked ? 'bg-gradient-to-br from-yellow-100 to-orange-100' : 'bg-gray-100'"
            >{{ ach.icon }}</div>
            <div class="text-[10px] font-medium text-gray-700 leading-tight">{{ ach.title }}</div>
          </div>
        </div>
        <p class="text-[10px] text-gray-400 mt-3 text-center">点击徽章查看说明</p>
      </Card>

      <!-- 体重变化 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <component :is="weightTrendIcon" class="h-4 w-4 text-[#0B5FD7]" />
          体液潴留与体重参考
        </h3>
        <p class="mb-3 text-[10px] leading-relaxed text-gray-500">心血管人群不以减重作为主要疗效指标；体重用于观察水肿、心衰和体液潴留风险。</p>
        <div v-if="bodyFluidWarning" class="mb-3 rounded-xl border px-3 py-2 text-[10px] leading-relaxed" :class="bodyFluidWarning.level === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'">
          {{ bodyFluidWarning.text }}
        </div>
        <template v-if="report.weightTrend.records.length > 0">
          <div class="flex items-center justify-between mb-4">
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">最早记录</div>
              <div class="text-xl font-bold text-gray-900">{{ fmt(report.weightTrend.startWeight) }} <span class="text-xs text-gray-400">kg</span></div>
            </div>
            <div class="flex-1 mx-4 text-center">
              <div class="text-2xl font-bold" :class="report.weightTrend.totalChange !== null && report.weightTrend.totalChange < 0 ? 'text-[#0B5FD7]' : 'text-orange-500'">
                {{ fmtChange(report.weightTrend.totalChange, 'kg') }}
              </div>
              <div class="text-xs text-gray-400 mt-1">{{ report.weightTrend.changePercent !== null ? `${Math.abs(report.weightTrend.changePercent).toFixed(1)}%` : '--' }}</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">最近记录</div>
              <div class="text-xl font-bold text-gray-900">{{ fmt(report.weightTrend.endWeight) }} <span class="text-xs text-gray-400">kg</span></div>
            </div>
          </div>
          <!-- SVG 折线图 -->
          <div v-if="svgPoints" class="w-full">
            <svg viewBox="0 0 280 100" class="w-full" preserveAspectRatio="none" style="height: 100px;">
              <defs>
                <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#0B5FD7" stop-opacity="0.2" />
                  <stop offset="100%" stop-color="#0B5FD7" stop-opacity="0" />
                </linearGradient>
              </defs>
              <polygon
                :points="`20,80 ${svgPoints} 260,80`"
                fill="url(#weightGrad)"
              />
              <polyline
                :points="svgPoints"
                fill="none"
                stroke="#0B5FD7"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <circle
                v-for="(r, i) in report.weightTrend.records"
                :key="i"
                :cx="20 + (i / (report.weightTrend.records.length - 1)) * 240"
                :cy="100 - 20 - ((r.weight - Math.min(...report.weightTrend.records.map(x => x.weight))) / (Math.max(...report.weightTrend.records.map(x => x.weight)) - Math.min(...report.weightTrend.records.map(x => x.weight)) || 1)) * 60"
                r="3"
                fill="#0B5FD7"
              />
            </svg>
          </div>
        </template>
        <div v-else class="text-center text-sm text-gray-400 py-6">暂无体重记录</div>
      </Card>

      <!-- 运动处方与安全执行 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <ShieldCheck class="h-4 w-4 text-emerald-600" />
          运动处方与安全执行
        </h3>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="rounded-xl bg-gray-50 py-3">
            <div class="text-xl font-bold text-gray-900">{{ effectiveExerciseDays }}</div>
            <div class="mt-1 text-[9px] text-gray-500">有效运动天数</div>
          </div>
          <div class="rounded-xl bg-gray-50 py-3">
            <div class="text-xl font-bold text-gray-900">{{ fmt(averageRpe, 1) }}</div>
            <div class="mt-1 text-[9px] text-gray-500">平均 RPE（1–5 级）</div>
          </div>
          <div class="rounded-xl py-3" :class="safetyStopEvents > 0 ? 'bg-amber-50' : 'bg-emerald-50'">
            <div class="text-xl font-bold" :class="safetyStopEvents > 0 ? 'text-amber-600' : 'text-emerald-600'">{{ safetyStopEvents }}</div>
            <div class="mt-1 text-[9px] text-gray-500">停止/不适当次</div>
          </div>
        </div>
        <div class="mt-3 space-y-1.5 rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-[10px] leading-relaxed text-amber-800">
          <p class="font-bold">停止运动信号</p>
          <p>胸痛、胸闷、晕厥、明显心悸、异常气短或血压 ≥180/110 时立即停止运动，并联系团队；持续胸痛或晕厥请拨打 120。</p>
          <p v-if="activePrescription">本营期处方：{{ activePrescription.mode }} · {{ activePrescription.targetHr }} · {{ activePrescription.rpe }}</p>
          <p v-else>当前营期暂无医师签署的运动处方，请勿自行进行中高强度运动。</p>
        </div>
      </Card>

      <!-- 随访、用药与饮食执行 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <Stethoscope class="h-4 w-4 text-[#0B5FD7]" />
          随访、用药与饮食
        </h3>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="rounded-xl bg-blue-50 py-3">
            <div class="text-lg font-bold text-[#0B5FD7]">{{ followupStats.staff }}</div>
            <div class="mt-1 text-[9px] text-gray-500">团队随访次数</div>
          </div>
          <div class="rounded-xl bg-blue-50 py-3">
            <div class="text-lg font-bold text-[#0B5FD7]">{{ followupStats.doctor }}</div>
            <div class="mt-1 text-[9px] text-gray-500">医师随访次数</div>
          </div>
          <div class="rounded-xl bg-blue-50 py-3">
            <div class="text-lg font-bold text-[#0B5FD7]">{{ fmtPct(dietAdherence.lowSalt) }}</div>
            <div class="mt-1 text-[9px] text-gray-500">低盐执行*</div>
          </div>
        </div>
        <div class="mt-3 space-y-2 text-[11px] leading-relaxed">
          <div class="flex items-start gap-2">
            <Pill class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0B5FD7]" />
            <p class="text-gray-600"><span class="font-bold text-gray-800">长期用药：</span>{{ medicalInfo.meds }}</p>
          </div>
          <p class="rounded-xl bg-gray-50 px-3 py-2 text-[10px] text-gray-500">
            服用他汀期间避免大量西柚汁；服用华法林时绿叶菜摄入保持稳定。不要自行停药、加量或使用他人药物。
          </p>
          <div class="grid grid-cols-2 gap-2 text-[10px]">
            <div class="rounded-lg bg-orange-50 px-2.5 py-2 text-orange-700">少油执行 {{ fmtPct(dietAdherence.lowOil) }}</div>
            <div class="rounded-lg bg-emerald-50 px-2.5 py-2 text-emerald-700">全谷物执行 {{ fmtPct(dietAdherence.wholeGrain) }}</div>
          </div>
          <p class="text-[9px] text-gray-400">* 未单独标记低盐时，按营养师饮食达标评分作为综合参考。</p>
          <p v-if="followupStats.last" class="text-[9px] text-gray-400">最近随访：{{ followupStats.last }}</p>
        </div>
      </Card>

      <!-- 指标变化（体成分 + 化验 合并为单模块，按分类分组；无营前营后数据则不显示） -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <Activity class="h-4 w-4 text-[#1677FF]" />
          检测指标变化
        </h3>
        <div v-if="metricGroups.length" class="space-y-4">
          <div v-for="[catName, items] in metricGroups" :key="catName">
            <div class="text-xs font-bold text-gray-500 mb-1 flex items-center gap-1.5">
              <Activity class="h-3 w-3 text-[#1677FF]" />
              {{ catName }}
            </div>
            <div class="space-y-2">
              <div
                v-for="m in items"
                :key="m.configId"
                class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-900">{{ m.name }}</div>
                  <div class="text-[10px] text-gray-400">
                    {{ m.beforeValue ?? '--' }} → {{ m.afterValue ?? '--' }} {{ m.unit }}
                    <span v-if="m.normalRange" class="ml-1">参考: {{ m.normalRange }}</span>
                  </div>
                </div>
                <div class="text-right shrink-0 ml-2">
                  <div class="text-sm font-bold" :class="metricChangeColor(m)">
                    {{ metricChangeText(m) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-center text-sm text-gray-400 py-6">本营期暂无指标检测数据</div>
      </Card>

      <!-- 打卡统计 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <Activity class="h-4 w-4 text-[#0B5FD7]" />
          打卡统计
        </h3>
        <div class="grid grid-cols-3 gap-3 text-center mb-4">
          <div class="bg-gray-50 rounded-lg py-3">
            <div class="text-xl font-bold text-gray-900">{{ report.checkinStats.totalCheckinDays }}</div>
            <div class="text-[10px] text-gray-500 mt-1">总打卡天数</div>
          </div>
          <div class="bg-[#0B5FD7]/5 rounded-lg py-3">
            <div class="text-xl font-bold text-[#0B5FD7]">{{ report.checkinStats.completeDays }}</div>
            <div class="text-[10px] text-gray-500 mt-1">完成全部打卡</div>
          </div>
          <div class="bg-orange-50 rounded-lg py-3">
            <div class="text-xl font-bold text-[#FF976A]">{{ report.checkinStats.longestStreak }}</div>
            <div class="text-[10px] text-gray-500 mt-1">最长连续天数</div>
          </div>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">饮食打卡天数</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.dietCheckinDays }} 天 / {{ report.checkinStats.totalDietRecords }} 条</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">运动打卡天数</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.exerciseCheckinDays }} 天 / {{ report.checkinStats.totalExerciseRecords }} 条</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">体重打卡天数</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.weightCheckinDays }} 天</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">总运动时长</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.totalExerciseDuration }} 分钟</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">饮食总得分</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.totalDietScore }} 分</span>
          </div>
        </div>
      </Card>

      <!-- 报告结论与下一步 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <HeartPulse class="h-4 w-4 text-[#0B5FD7]" />
          报告结论与下一步
        </h3>
        <div class="space-y-2.5">
          <div v-for="item in cardioConclusions" :key="item.title" class="rounded-xl bg-gray-50 px-3 py-2.5">
            <div class="flex items-center gap-1.5">
              <span class="h-1.5 w-1.5 rounded-full" :class="item.good ? 'bg-emerald-500' : 'bg-amber-500'"></span>
              <span class="text-xs font-bold text-gray-800">{{ item.title }}</span>
            </div>
            <p class="mt-1 text-[10px] leading-relaxed text-gray-500">{{ item.text }}</p>
          </div>
        </div>
        <p class="mt-3 text-[9px] leading-relaxed text-gray-400">本报告用于健康管理随访，不替代医师诊断。血压、血脂目标及用药调整须由医师结合病历和危险分层确定。</p>
      </Card>

      <!-- 结营寄语（支持多名营养师各自撰写提交，逐条展示带角色姓名，不互相覆盖） -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b border-[#1677FF]/10 pb-2">
          <MessageCircle class="h-4 w-4 text-[#1677FF]" />
          结营寄语
        </h3>
        <div v-if="reportMessages.length > 0" class="space-y-3">
          <div v-for="m in reportMessages" :key="m.id"
               class="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
              <span :class="['text-[10px] font-bold px-2 py-0.5 rounded-full border', roleTag(m).cls]">{{ roleTag(m).badge }}</span>
              <span class="text-xs font-bold text-gray-800">{{ m.name }}</span>
              <span class="ml-auto text-[10px] text-gray-300">{{ formatMsgTime(m.time) }}</span>
            </div>
            <p class="text-sm text-gray-700 leading-relaxed">{{ m.text }}</p>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400 py-2">本营期暂无结营寄语</p>
      </Card>

      <!-- 底部鼓励语 -->
      <div class="text-center py-4">
        <p class="text-sm text-gray-400">
          {{ report.studentName }} · 心脑血管健康营
        </p>
        <p class="text-xs text-gray-300 mt-1">坚持就是胜利，健康是最好的奖励</p>
      </div>
    </div>

    <!-- 徽章详情弹窗（与「我的徽章」同一组件） -->
    <BadgeInfoPopup v-model:show="showBadgeInfo" :config="selectedBadgeCfg" :records="selectedBadgeRecords" :camp-name="campInfo?.name" />

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round>
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button
            v-for="camp in studentCamps"
            :key="camp.id"
            @click="selectedCampId = camp.id; showCampPicker = false"
            :class="[
              'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
              selectedCampId === camp.id
                ? 'border-[#0B5FD7] bg-blue-50 text-[#0B5FD7]'
                : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50',
            ]"
          >
            <div class="flex-1 text-left min-w-0"><span class="font-medium">{{ camp.name }}</span><div class="text-[10px] text-gray-400 mt-0.5">{{ campDateRange(camp) }}</div></div>
            <span
              v-if="camp.status === 'active'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600"
            >进行中</span>
            <span
              v-else-if="camp.status === 'ended'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
            >已结束</span>
            <span
              v-else
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-500"
            >未开始</span>
          </button>
        </div>
      </div>
    </VanPopup>

    <StudentTabbar anchor="dashboard" print-hidden :badge="unreadCount > 0 ? unreadCount : undefined" />
  </div>
</template>

<style>
@media print {
  /* 隐藏不需要打印的元素 */
  .print\:hidden { display: none !important; }
  .custom-nav { display: none !important; }
  .custom-tabbar { display: none !important; }
  .van-overlay { display: none !important; }
  /* 白色背景 */
  body { background: white !important; }
  /* 移除阴影和圆角，节省墨水 */
  .shadow-lg, .shadow-sm, .shadow-md { box-shadow: none !important; }
  /* 避免在卡片内分页 */
  .grid { break-inside: avoid; }
  /* 确保内容占满宽度 */
  .max-w-md { max-width: 100% !important; }
  .mx-auto { margin: 0 !important; }
  .fixed { position: static !important; }
  .overflow-y-auto { overflow: visible !important; }
  .pb-24 { padding-bottom: 1rem !important; }
  .pt-12 { padding-top: 0 !important; }
}
</style>
