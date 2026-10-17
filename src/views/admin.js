/**
 * Administrator console: operational overview, bookings, users, provider
 * verification, commission settings, support cases and withdrawal review.
 * Authorisation is enforced by the backend on every request.
 */
import { api, ApiError, errorKey } from '../api.js';
import {
  esc, icon, t, money, toast, setBusy, observeReveals, emptyState,
  register, navigate, statusTag, avatar, stars, serviceName
} from '../ui.js';
import { getState, setState, serviceById } from '../store.js';
import { formatDate, formatDateTime, formatNumber } from '../i18n.js';

/* Withdrawal states, mapped to static keys so nothing untranslated can render. */
const PAYOUT_STATUS = { REQUESTED: 'status.OPEN', PAID: 'status.COMPLETED', REJECTED: 'status.CANCELLED' };

function requireAdmin() {
  const user = getState().user;
  if (!user) return '#/';
  if (user.role !== 'ADMIN') return user.role === 'WORKER' ? '#/work' : '#/home';
  return null;
}

/* ======================= overview ====================================== */
export async function adminView() {
  const redirect = requireAdmin();
  if (redirect) return { redirect };
  let overview = null;
  let ops = null;
  try { overview = await api.adminOverview(); } catch { overview = null; }
  try { ops = await api.opsOverview(); } catch { ops = null; }
  if (!overview) return { body: emptyState({ art: 'assets/illustrations/offline.svg', title: t('error.title'), body: t('admin.noAccess') }), chrome: 'app', active: 'admin' };

  const metrics = overview.metrics;
  const settings = overview.settings || {};
  const opMetrics = (ops && ops.metrics) || {};

  const body = `
    <div class="stack-lg">
      <div class="page-head"><div><p class="eyebrow">${esc(t('admin.title'))}</p><h1>${esc(t('admin.sub'))}</h1></div></div>

      <section class="grid grid-4">
        ${[
          ['Users', metrics.users, 'Users'],
          ['Providers', metrics.workers, 'Suitcase'],
          ['Open requests', metrics.openRequests, 'Bell_Notification'],
          ['Bookings', metrics.bookings, 'List_Checklist']
        ].map(([label, value, ic]) => `<div class="card reveal">
          <div class="icon-badge teal" style="margin-bottom:10px">${icon(ic)}</div>
          <div class="h2 num">${esc(formatNumber(value || 0))}</div>
          <div class="muted small">${esc(label)}</div></div>`).join('')}
      </section>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('admin.analyticsTitle'))}</h2></div>
        <div class="grid grid-4">
          ${[
            [t('admin.analyticsActive'), opMetrics.active],
            [t('admin.analyticsCompleted'), opMetrics.completed],
            [t('admin.analyticsCancelled'), opMetrics.cancellations],
            [t('admin.analyticsGross'), money(opMetrics.commissionPaisa || 0)]
          ].map(([label, value]) => `<div class="card flat">
            <div class="h3 num">${esc(typeof value === 'number' ? formatNumber(value) : value)}</div>
            <div class="muted small">${esc(label)}</div></div>`).join('')}
        </div>
      </section>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('admin.feeTitle'))}</h2></div>
        <form class="card" data-role="settings-form">
          <div class="form-row three" style="display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
            <div class="field"><label for="set-commission">${esc(t('admin.commission'))}</label>
              <input id="set-commission" name="commissionPercent" type="number" min="0" max="50" step="0.5" value="${esc((settings.commissionBps || 0) / 100)}" /></div>
            <div class="field"><label for="set-feetype">${esc(t('admin.feeModel'))}</label>
              <select id="set-feetype" name="feeType">
                <option value="fixed" ${settings.feeType === 'fixed' ? 'selected' : ''}>${esc(t('admin.feeFixed'))}</option>
                <option value="percent" ${settings.feeType === 'percent' ? 'selected' : ''}>${esc(t('admin.feePercent'))}</option>
              </select></div>
            <div class="field"><label for="set-feevalue">${esc(t('admin.feeValue'))}</label>
              <input id="set-feevalue" name="feeValue" type="number" min="0" step="1" value="${esc(settings.feeType === 'percent' ? (settings.feeValue || 0) / 100 : (settings.feeValue || 0) / 100)}" /></div>
          </div>
          <div class="row" style="margin-top:16px;justify-content:flex-end">
            <button class="btn" type="submit">${icon('Check')}${esc(t('admin.saveSettings'))}</button>
          </div>
        </form>
      </section>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('admin.servicesTitle'))}</h2></div>
        <div class="card">
          <div class="list-item"><div><b>${esc(t('admin.servicesTitle'))}</b>
            <p class="muted small">${esc(t('admin.servicesSub'))}</p></div>
            <a class="btn secondary sm" href="#/admin/services">${icon('Layers')}${esc(t('common.view'))}</a></div>
        </div>
      </section>
    </div>`;

  return { body, chrome: 'app', active: 'admin', after: () => {
    observeReveals();
    const form = document.querySelector('[data-role="settings-form"]');
    if (form) form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      const data = Object.fromEntries(new FormData(event.currentTarget));
      setBusy(button, true);
      try {
        await api.updateSettings({
          commissionBps: Math.round(Number(data.commissionPercent) * 100),
          feeType: data.feeType,
          feeValue: Math.round(Number(data.feeValue) * 100)
        });
        // refresh the shared fee model so every quote in the app matches
        const stats = await api.publicStats().catch(() => null);
        if (stats && stats.stats) setState({ fees: stats.stats.fees, publicStats: stats.stats });
        toast(t('admin.settingsSaved'), 'success');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (error) { toast(t(errorKey(error)), 'error'); } finally { setBusy(button, false); }
    });
  } };
}

/* ======================= services ====================================== */
export async function adminServicesView() {
  const redirect = requireAdmin();
  if (redirect) return { redirect };
  let overview = null;
  try { overview = await api.adminOverview(); } catch { overview = null; }
  const services = (overview && overview.services) || [];
  const active = services.filter((s) => s.active).length;

  const body = `
    <div class="stack-lg">
      <div class="page-head"><div><p class="eyebrow">${esc(t('admin.title'))}</p>
        <h1>${esc(t('admin.servicesTitle'))}</h1>
        <p class="muted">${esc(t('admin.servicesSub'))}</p></div></div>

      <section class="grid grid-4">
        ${[
          [t('admin.servicesTotal'), services.length, 'Layers'],
          [t('admin.servicesLive'), active, 'Circle_Check'],
          [t('admin.servicesPaused'), services.length - active, 'Pause_Circle']
        ].map(([label, value, ic]) => `<div class="card reveal">
          <div class="icon-badge teal" style="margin-bottom:10px">${icon(ic)}</div>
          <div class="h2 num">${esc(formatNumber(value))}</div>
          <div class="muted small">${esc(label)}</div></div>`).join('')}
      </section>

      <section class="reveal">
        <div class="card">
          ${services.length ? services.map((s) => `<div class="list-item">
            <div class="row" style="gap:10px"><div class="icon-badge">${icon(s.icon || 'Settings')}</div>
              <div><b>${esc(serviceName(s))}</b><p class="muted small">${esc(s.en || '')}</p>
                <p class="muted tiny">${esc(s.blurbBn || s.blurbEn || '')}</p></div></div>
            <div class="row" style="gap:10px">
              <span class="tag ${s.active ? 'done' : 'draft'}">${esc(t(s.active ? 'provider.active' : 'provider.paused'))}</span>
              <button class="btn ghost sm" data-action="toggle-service" data-id="${esc(s.id)}" data-active="${s.active ? '1' : '0'}">${esc(t(s.active ? 'admin.pauseService' : 'admin.activateService'))}</button>
            </div>
          </div>`).join('') : emptyState({ art: 'assets/illustrations/empty-bookings.svg', title: t('admin.servicesTitle'), body: t('admin.servicesSub') })}
        </div>
      </section>
    </div>`;

  return { body, chrome: 'app', active: 'admin-services', after: () => observeReveals() };
}

/* ======================= payouts ======================================= */
export async function adminPayoutsView() {
  const redirect = requireAdmin();
  if (redirect) return { redirect };
  let payouts = [];
  try { payouts = (await api.adminPayouts()).payouts || []; } catch { payouts = []; }
  const pending = payouts.filter((p) => p.status === 'REQUESTED');
  const settled = payouts.filter((p) => p.status !== 'REQUESTED');
  const pendingTotal = pending.reduce((sum, p) => sum + (p.amount || 0), 0);

  const row = (p) => `<div class="list-item">
    <div><b class="num">${esc(money(p.amount))}</b>
      <p class="muted small">${esc((p.worker && p.worker.name) || '')} · ${esc(formatDateTime(p.createdAt))}</p></div>
    <div class="row" style="gap:8px">
      <span class="tag ${p.status === 'PAID' ? 'done' : p.status === 'REJECTED' ? 'cancelled' : 'open'}">${esc(t(PAYOUT_STATUS[p.status] || 'status.OPEN'))}</span>
      ${p.status === 'REQUESTED' ? `
        <button class="btn sm" data-action="update-payout" data-id="${esc(p.id)}" data-status="PAID">${esc(t('admin.markPaid'))}</button>
        <button class="btn ghost sm" data-action="update-payout" data-id="${esc(p.id)}" data-status="REJECTED">${esc(t('admin.reject'))}</button>` : ''}
    </div>
  </div>`;

  const body = `
    <div class="stack-lg">
      <div class="page-head"><div><p class="eyebrow">${esc(t('admin.title'))}</p>
        <h1>${esc(t('admin.payoutsTitle'))}</h1>
        <p class="muted">${esc(t('admin.payoutsSub'))}</p></div></div>

      <section class="grid grid-4">
        ${[
          [t('admin.payoutsPending'), pending.length, 'Timer'],
          [t('admin.payoutsPendingTotal'), money(pendingTotal), 'Credit_Card_02'],
          [t('admin.payoutsSettled'), settled.length, 'Circle_Check']
        ].map(([label, value, ic]) => `<div class="card reveal">
          <div class="icon-badge teal" style="margin-bottom:10px">${icon(ic)}</div>
          <div class="h2 num">${esc(typeof value === 'number' ? formatNumber(value) : value)}</div>
          <div class="muted small">${esc(label)}</div></div>`).join('')}
      </section>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('admin.payoutsPending'))}</h2></div>
        ${pending.length ? `<div class="card">${pending.map(row).join('')}</div>`
          : emptyState({ art: 'assets/illustrations/empty-bookings.svg', title: t('provider.noPayouts') })}
      </section>

      ${settled.length ? `<section class="reveal">
        <div class="section-head"><h2>${esc(t('admin.payoutsSettled'))}</h2></div>
        <div class="card">${settled.map(row).join('')}</div>
      </section>` : ''}
    </div>`;

  return { body, chrome: 'app', active: 'admin-payouts', after: () => observeReveals() };
}

/* ======================= bookings ====================================== */
export async function adminBookingsView() {
  const redirect = requireAdmin();
  if (redirect) return { redirect };
  const overview = await api.adminOverview().catch(() => null);
  if (!overview) return { body: emptyState({ art: 'assets/illustrations/offline.svg', title: t('error.title') }), chrome: 'app', active: 'admin-bookings' };
  const services = overview.services || [];
  if (!getState().services.length) setState({ services });
  const bookings = (overview.bookings || []).slice().reverse();
  const requests = overview.requests || [];
  const requestById = new Map(requests.map((r) => [r.id, r]));
  const userById = new Map((overview.users || []).map((u) => [u.id, u]));

  const body = `
    <div class="stack-lg">
      <div class="page-head"><div><h1>${esc(t('nav.bookings'))}</h1><p class="muted">${esc(t('admin.sub'))}</p></div></div>
      ${bookings.length ? `<div class="table-wrap">
        <table class="data">
          <thead><tr><th>${esc(t('service.overview'))}</th><th>${esc(t('track.provider'))}</th><th>${esc(t('common.rating'))}</th><th>${esc(t('booking.total'))}</th><th>${esc(t('track.statusTitle'))}</th></tr></thead>
          <tbody>
            ${bookings.map((b) => {
              const request = requestById.get(b.requestId) || {};
              const service = services.find((s) => s.id === request.service);
              const customer = userById.get(b.customerId);
              const worker = userById.get(b.workerId);
              return `<tr>
                <td><b>${esc(service ? serviceName(service) : request.service || '')}</b><br><span class="muted small">${esc(request.area || '')} · ${esc(formatDate(request.date))}</span></td>
                <td>${esc((worker && worker.name) || '—')}<br><span class="muted small">${esc((customer && customer.name) || '')}</span></td>
                <td class="num">${esc(money((b.pricing || {}).total || 0))}</td>
                <td class="num">${esc(money((b.pricing || {}).gross || 0))}</td>
                <td>${statusTag(b.status)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : emptyState({ art: 'assets/illustrations/empty-bookings.svg', title: t('activity.noBookings') })}
    </div>`;
  return { body, chrome: 'app', active: 'admin-bookings', after: () => observeReveals() };
}

/* ======================= users ========================================= */
export async function adminUsersView() {
  const redirect = requireAdmin();
  if (redirect) return { redirect };
  let providers = [];
  let overview = null;
  try { providers = (await api.adminProviders()).providers || []; } catch { providers = []; }
  try { overview = await api.adminOverview(); } catch { overview = null; }
  const users = (overview && overview.users) || [];

  const body = `
    <div class="stack-lg">
      <div class="page-head"><div><h1>${esc(t('nav.users'))}</h1><p class="muted">${esc(t('admin.providersTitle'))}</p></div></div>

      <section>
        <div class="section-head"><h2>${esc(t('admin.providersTitle'))}</h2></div>
        ${providers.length ? `<div class="grid grid-2">${providers.map((p) => `<article class="card reveal">
          <div class="row" style="align-items:flex-start">
            ${avatar(p)}
            <div class="grow"><div class="row" style="gap:8px"><b>${esc(p.name)}</b>
              ${p.verified ? `<span class="tag done">${esc(t('admin.verified'))}</span>` : `<span class="tag open">${esc(t('admin.pending'))}</span>`}</div>
              <p class="muted small">${esc((p.skills || []).map((s) => serviceName(serviceById(s) || { id: s, bn: s, en: s })).join(' · '))}</p>
              ${stars(p.rating)}
              <p class="muted tiny">${esc(p.phone || '')}${p.email ? ` · ${esc(p.email)}` : ''} · ${esc(t('support.description'))}: ${esc(p.documents || 0)}</p>
            </div>
          </div>
        </article>`).join('')}</div>` : emptyState({ art: 'assets/illustrations/empty-providers.svg', title: t('explore.noResults') })}
      </section>

      <section>
        <div class="section-head"><h2>${esc(t('admin.userList'))}</h2></div>
        ${users.length ? `<div class="table-wrap">
          <table class="data">
            <thead><tr><th>${esc(t('auth.name'))}</th><th>${esc(t('auth.role'))}</th><th>${esc(t('account.phone'))}</th><th>${esc(t('admin.analyticsActive'))}</th></tr></thead>
            <tbody>${users.map((u) => `<tr>
              <td>${esc(u.name)}</td>
              <td>${esc(u.role)}</td>
              <td class="num">${esc(u.phone || '')}</td>
              <td>${u.role === 'ADMIN' ? '—' : `<button class="btn ghost sm" data-action="toggle-user" data-id="${esc(u.id)}" data-disabled="${u.disabled ? '1' : '0'}">${esc(t(u.disabled ? 'admin.enable' : 'admin.disable'))}</button>`}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>` : ''}
      </section>
    </div>`;
  return { body, chrome: 'app', active: 'admin-users', after: () => observeReveals() };
}

/* ======================= support ======================================= */
export async function adminSupportView() {
  const redirect = requireAdmin();
  if (redirect) return { redirect };
  let cases = [];
  let payouts = [];
  try { cases = (await api.adminSupport()).cases || []; } catch { cases = []; }
  try { payouts = (await api.adminPayouts()).payouts || []; } catch { payouts = []; }
  const pendingPayouts = payouts.filter((p) => p.status === 'REQUESTED').length;

  const statusKey = (s) => ({ OPEN: 'support.statusOpen', IN_REVIEW: 'support.statusReview', RESOLVED: 'support.statusResolved', CLOSED: 'support.statusClosed' }[s] || 'support.statusOpen');
  const categoryKey = (category) => ({
    BOOKING: 'support.catBooking', PAYMENT: 'support.catPayment',
    PROVIDER: 'support.catProvider', ACCOUNT: 'support.catAccount', OTHER: 'support.catOther'
  }[String(category || '').toUpperCase()] || 'support.catOther');

  const body = `
    <div class="stack-lg">
      <div class="page-head"><div><h1>${esc(t('admin.supportTitle'))}</h1><p class="muted">${esc(t('support.sub'))}</p></div></div>

      ${pendingPayouts ? `<a class="card flat row-between" href="#/admin/payouts" style="text-decoration:none">
        <span class="row" style="gap:10px">${icon('Credit_Card_02')}<b>${esc(t('admin.payoutsPending'))}</b></span>
        <span class="tag open">${esc(formatNumber(pendingPayouts))}</span>
      </a>` : ''}

      <section>
        ${cases.length ? `<div class="card">${cases.map((c) => `<div class="list-item">
          <div class="row" style="align-items:flex-start"><div class="icon-badge ink">${icon('Headphones')}</div>
            <div><b>${esc(t(categoryKey(c.category)))}</b><p class="muted small clamp-2">${esc(c.description)}</p>
              <p class="muted tiny">${esc(formatDateTime(c.createdAt))}</p></div></div>
          <div class="row" style="gap:8px">
            <span class="tag ${c.status === 'RESOLVED' ? 'done' : c.status === 'CLOSED' ? 'draft' : 'open'}">${esc(t(statusKey(c.status)))}</span>
            <select class="input" data-action="update-support" data-id="${esc(c.id)}" style="min-height:38px;width:auto">
              <option value="">—</option>
              <option value="IN_REVIEW">${esc(t('support.statusReview'))}</option>
              <option value="RESOLVED">${esc(t('support.statusResolved'))}</option>
              <option value="CLOSED">${esc(t('support.statusClosed'))}</option>
            </select>
          </div>
        </div>`).join('')}</div>` : emptyState({ art: 'assets/illustrations/support.svg', title: t('support.noCases') })}
      </section>
    </div>`;
  return { body, chrome: 'app', active: 'admin-support', after: () => observeReveals() };
}

/* ======================= registrations ================================= */
register('toggle-service', async (data, event, el) => {
  const active = data.active !== '1';
  setBusy(el, true);
  try {
    await api.updateService(data.id, { active });
    toast(t(active ? 'provider.active' : 'provider.paused'), 'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) { toast(t(errorKey(error)), 'error'); } finally { setBusy(el, false); }
});

register('toggle-user', async (data, event, el) => {
  const disabled = data.disabled !== '1';
  setBusy(el, true);
  try {
    await api.updateUser(data.id, { disabled });
    toast(t(disabled ? 'admin.disable' : 'admin.enable') + ' ✓', 'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) { toast(t(errorKey(error)), 'error'); } finally { setBusy(el, false); }
});

register('update-payout', async (data, event, el) => {
  setBusy(el, true);
  try {
    await api.updatePayout(data.id, data.status);
    toast(t('admin.payoutsTitle') + ' ✓', 'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) { toast(t(errorKey(error)), 'error'); } finally { setBusy(el, false); }
});

// A select cannot carry data-action through the action bus (change, not click),
// so support status updates are wired with a delegated change listener here.
document.addEventListener('change', async (event) => {
  const el = event.target.closest('[data-action="update-support"]');
  if (!el || !el.value) return;
  try {
    await api.updateSupportCase(el.dataset.id, el.value);
    toast(t('support.submitted'), 'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) { toast(t(errorKey(error)), 'error'); }
});
