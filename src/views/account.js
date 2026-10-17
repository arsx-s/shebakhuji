/**
 * Account, saved addresses, support cases and the unified inbox
 * (booking conversations + notifications).
 */
import { api, ApiError, errorKey } from '../api.js';
import {
  esc, icon, t, money, toast, sheet, closeSheet, confirm, setBusy, observeReveals,
  emptyState, avatar, register, navigate, statusTag, stars
} from '../ui.js';
import { getState, setState, serviceById, unreadCount } from '../store.js';
import { getLang, setLang, formatDate, formatDateTime } from '../i18n.js';
import { signOut, refreshNotifications } from './auth.js';
import { openChat, isOpen } from './customer.js';

const NOTIFY_KEY = 'shebashathi.notify';

function notifyPref() {
  try { return localStorage.getItem(NOTIFY_KEY) !== 'off'; } catch { return true; }
}
function setNotifyPref(on) {
  try { localStorage.setItem(NOTIFY_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}

/* ======================= account ======================================== */
export async function accountView() {
  const state = getState();
  const user = state.user;
  if (!user) return { redirect: '#/' };
  const isWorker = user.role === 'WORKER';
  const services = state.services.length ? state.services : await api.services().then((r) => { setState({ services: r.services || [] }); return r.services || []; }).catch(() => []);

  const body = `
    <div class="stack-lg">
      <div class="card reveal">
        <div class="row" style="align-items:flex-start">
          ${avatar(user, { size: 'lg' })}
          <div class="grow">
            <div class="row wrap" style="gap:8px">
              <h1>${esc(user.name)}</h1>
              ${user.verified ? `<span class="tag done">${icon('Shield_Check')}${esc(t('account.verifiedBadge'))}</span>` : `<span class="tag draft">${esc(t('account.unverifiedBadge'))}</span>`}
              <span class="tag">${icon(isWorker ? 'Suitcase' : 'User_01')}${esc(t(isWorker ? 'auth.roleProvider' : 'auth.roleCustomer'))}</span>
            </div>
            <p class="muted small">${esc([user.area, user.district].filter(Boolean).join(', ') || t('home.locationDefault'))}</p>
            <p class="muted small">${esc(user.phone || '')}${user.email ? ` · ${esc(user.email)}` : ''}</p>
          </div>
        </div>
        ${isWorker ? `
          <hr class="divider" />
          <div class="row-between">
            <div><b>${esc(t('account.availability'))}</b><p class="muted small">${esc(t('account.availabilityNote'))}</p></div>
            <input type="checkbox" class="switch" data-action="toggle-availability" ${user.available ? 'checked' : ''} aria-label="${esc(t('account.availability'))}" />
          </div>` : ''}
      </div>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('account.editProfile'))}</h2></div>
        <form class="card" data-role="profile-form">
          <div class="form-row two">
            <div class="field"><label for="p-name">${esc(t('auth.name'))}</label><input id="p-name" name="name" value="${esc(user.name)}" required /></div>
            <div class="field"><label for="p-email">${esc(t('account.email'))}</label><input id="p-email" name="email" type="email" value="${esc(user.email || '')}" placeholder="name@example.com" /></div>
          </div>
          <div class="form-row two">
            <div class="field"><label for="p-district">${esc(t('auth.district'))}</label><input id="p-district" name="district" value="${esc(user.district || '')}" /></div>
            <div class="field"><label for="p-area">${esc(t('auth.area'))}</label><input id="p-area" name="area" value="${esc(user.area || '')}" /></div>
          </div>
          <div class="field"><label for="p-bio">${esc(t('account.bio'))}</label>
            <textarea id="p-bio" name="bio" maxlength="1000" placeholder="${esc(t('account.bioPh'))}">${esc(user.bio || '')}</textarea></div>
          ${isWorker ? `
            <div class="field"><label>${esc(t('account.skills'))}</label>
              <span class="hint">${esc(t('account.skillsNote'))}</span>
              <div class="pill-choices" data-role="skills">
                ${services.map((s) => `<button type="button" class="choice" data-action="toggle-skill" data-id="${esc(s.id)}" aria-pressed="${(user.skills || []).includes(s.id)}">${icon(s.icon || 'Settings')}<span>${esc(getLang() === 'en' ? s.en : s.bn)}</span></button>`).join('')}
              </div>
            </div>` : ''}
          <div class="row" style="margin-top:16px;justify-content:flex-end">
            <button class="btn lg" type="submit">${icon('Check')}${esc(t('account.save'))}</button>
          </div>
        </form>
      </section>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('account.language'))}</h2></div>
        <div class="card">
          <div class="row-between">
            <div><b>${esc(t('account.language'))}</b><p class="muted small">${esc(t('account.languageNote'))}</p></div>
            <div class="segmented">
              <button data-action="set-lang" data-lang="bn" aria-pressed="${getLang() === 'bn'}">বাংলা</button>
              <button data-action="set-lang" data-lang="en" aria-pressed="${getLang() === 'en'}">English</button>
            </div>
          </div>
          <hr class="divider" />
          <div class="row-between">
            <div><b>${esc(t('account.notifications'))}</b><p class="muted small">${esc(t('account.notificationsNote'))}</p></div>
            <input type="checkbox" class="switch" data-action="toggle-notify" ${notifyPref() ? 'checked' : ''} aria-label="${esc(t('account.notifications'))}" />
          </div>
        </div>
      </section>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('account.title'))}</h2></div>
        <div class="card">
          <div class="list">
            <a class="list-item" href="#/activity" style="text-decoration:none">
              <span class="row"><span class="icon-badge ink">${icon('List_Checklist')}</span><b>${esc(t('account.history'))}</b></span>${icon('Chevron_Right')}
            </a>
            <a class="list-item" href="#/account/addresses" style="text-decoration:none">
              <span class="row"><span class="icon-badge ink">${icon('Map_Pin')}</span><b>${esc(t('account.addresses'))}</b></span>${icon('Chevron_Right')}
            </a>
            <a class="list-item" href="#/account/support" style="text-decoration:none">
              <span class="row"><span class="icon-badge ink">${icon('Headphones')}</span><b>${esc(t('account.support'))}</b></span>${icon('Chevron_Right')}
            </a>
            ${isWorker ? `<a class="list-item" href="#/listings" style="text-decoration:none">
              <span class="row"><span class="icon-badge ink">${icon('Shopping_Bag_01')}</span><b>${esc(t('provider.listingsTitle'))}</b></span>${icon('Chevron_Right')}
            </a>` : ''}
          </div>
        </div>
      </section>

      <section class="reveal">
        <div class="card flat">
          <div class="row" style="align-items:flex-start"><div class="icon-badge teal">${icon('Shield_Check')}</div>
            <div><b>${esc(t('account.privacy'))}</b><p class="muted small">${esc(t('account.privacyNote'))}</p></div></div>
        </div>
      </section>

      <section class="reveal">
        <button class="btn danger block lg" data-action="sign-out">${icon('Log_Out')}${esc(t('account.signout'))}</button>
      </section>
    </div>`;

  return { body, chrome: 'app', active: 'account', after: () => {
    observeReveals();
    const form = document.querySelector('[data-role="profile-form"]');
    if (form) form.addEventListener('submit', saveProfile);
  } };
}

async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  const skills = Array.from(document.querySelectorAll('[data-role="skills"] .choice[aria-pressed="true"]')).map((el) => el.dataset.id);
  const payload = {
    name: data.name, email: data.email || undefined, district: data.district,
    area: data.area, bio: data.bio, preferredLanguage: getLang(),
    ...(skills.length ? { skills } : {})
  };
  setBusy(button, true, t('common.loading'));
  try {
    const res = await api.updateMe(payload);
    setState({ user: res.user });
    toast(t('account.saved'), 'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) {
    toast(error instanceof ApiError && error.status === 409 ? t('auth.errExists') : t(errorKey(error)), 'error');
  } finally { setBusy(button, false); }
}

/* ======================= addresses ====================================== */
export async function addressesView() {
  const state = getState();
  if (!state.user) return { redirect: '#/' };
  let properties = [];
  try { properties = (await api.properties()).properties || []; } catch { properties = []; }

  const body = `
    <div class="stack-lg">
      <div class="page-head">
        <div><a class="btn ghost sm" href="#/account">${icon('Arrow_Left_MD')}${esc(t('common.back'))}</a>
          <h1 style="margin-top:8px">${esc(t('account.addresses'))}</h1></div>
        <button class="btn" data-action="new-address">${icon('Add_Plus')}${esc(t('account.addAddress'))}</button>
      </div>
      ${properties.length ? `<div class="grid grid-2">${properties.map((p) => `
        <article class="card">
          <div class="row" style="gap:10px;align-items:flex-start">
            <div class="icon-badge">${icon(p.kind === 'OFFICE' ? 'Building_02' : 'House_01')}</div>
            <div class="grow"><b>${esc(p.label)}</b>
              <p class="muted small">${esc([p.address, p.area, p.district].filter(Boolean).join(', '))}</p>
              <span class="tag">${esc(t(p.kind === 'OFFICE' ? 'account.kindOffice' : 'account.kindHome'))}</span>
            </div>
          </div>
        </article>`).join('')}</div>`
        : emptyState({ art: 'assets/illustrations/empty-providers.svg', title: t('account.noAddresses'), action: `<button class="btn" data-action="new-address">${esc(t('account.addAddress'))}</button>` })}
    </div>`;
  return { body, chrome: 'app', active: 'account', after: () => observeReveals() };
}

function addressSheet() {
  const services = getState().services;
  const dialog = sheet({
    title: t('account.addAddress'),
    body: `<form data-role="address-form">
      <div class="field"><label for="a-label">${esc(t('account.addressLabel'))}</label>
        <input id="a-label" name="label" required placeholder="${esc(t('account.addressLabelPh'))}" /></div>
      <div class="field"><label for="a-kind">${esc(t('account.addressKind'))}</label>
        <select id="a-kind" name="kind">
          <option value="HOME">${esc(t('account.kindHome'))}</option>
          <option value="OFFICE">${esc(t('account.kindOffice'))}</option>
        </select></div>
      <div class="form-row two">
        <div class="field"><label for="a-district">${esc(t('booking.district'))}</label><input id="a-district" name="district" value="${esc((getState().user && getState().user.district) || 'Dhaka')}" /></div>
        <div class="field"><label for="a-area">${esc(t('booking.area'))}</label><input id="a-area" name="area" value="${esc((getState().user && getState().user.area) || '')}" /></div>
      </div>
      <div class="field"><label for="a-address">${esc(t('booking.address'))}</label>
        <input id="a-address" name="address" placeholder="${esc(t('booking.addressPh'))}" /></div>
      <button class="btn block lg" type="submit" style="margin-top:16px">${esc(t('common.save'))}</button>
    </form>`
  });
  dialog.body.querySelector('[data-role="address-form"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(button, true);
    try {
      await api.createProperty(data);
      closeSheet();
      toast(t('common.save') + ' ✓', 'success');
      if (window.location.hash.startsWith('#/account/addresses')) window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) { toast(t(errorKey(error)), 'error'); } finally { setBusy(button, false); }
  });
}

/* ======================= support ======================================== */
export async function supportView(params, query = {}) {
  const state = getState();
  if (!state.user) return { redirect: '#/' };
  let cases = [];
  try { cases = (await api.supportCases()).cases || []; } catch { cases = []; }
  const bookings = await api.bookings().then((r) => r.bookings || []).catch(() => []);

  const statusKey = (status) => ({
    OPEN: 'support.statusOpen', IN_REVIEW: 'support.statusReview',
    RESOLVED: 'support.statusResolved', CLOSED: 'support.statusClosed'
  }[status] || 'support.statusOpen');
  /* Static keys, upper-cased to match what the form submits ('BOOKING'), so a
     case difference can never leak a raw translation key into the list. */
  const categoryKey = (category) => ({
    BOOKING: 'support.catBooking', PAYMENT: 'support.catPayment',
    PROVIDER: 'support.catProvider', ACCOUNT: 'support.catAccount', OTHER: 'support.catOther'
  }[String(category || '').toUpperCase()] || 'support.catOther');

  const body = `
    <div class="stack-lg">
      <div class="page-head">
        <div><a class="btn ghost sm" href="#/account">${icon('Arrow_Left_MD')}${esc(t('common.back'))}</a>
          <h1 style="margin-top:8px">${esc(t('support.title'))}</h1>
          <p class="muted">${esc(t('support.sub'))}</p></div>
      </div>

      <section class="card reveal">
        <h2>${esc(t('support.new'))}</h2>
        <form data-role="support-form" style="margin-top:14px">
          <div class="form-row two">
            <div class="field"><label for="s-category">${esc(t('support.category'))}</label>
              <select id="s-category" name="category">
                <option value="BOOKING">${esc(t('support.catBooking'))}</option>
                <option value="PAYMENT">${esc(t('support.catPayment'))}</option>
                <option value="PROVIDER">${esc(t('support.catProvider'))}</option>
                <option value="ACCOUNT">${esc(t('support.catAccount'))}</option>
                <option value="OTHER">${esc(t('support.catOther'))}</option>
              </select></div>
            <div class="field"><label for="s-booking">${esc(t('support.linkedBooking'))}</label>
              <select id="s-booking" name="bookingId">
                <option value="">—</option>
                ${bookings.map((b) => {
                  const service = serviceById((b.request || {}).service);
                  const label = `${service ? (getLang() === 'en' ? service.en : service.bn) : (b.request || {}).service} · ${formatDate((b.request || {}).date)}`;
                  return `<option value="${esc(b.id)}" ${query.booking === b.id ? 'selected' : ''}>${esc(label)}</option>`;
                }).join('')}
              </select></div>
          </div>
          <div class="field"><label for="s-desc">${esc(t('support.description'))}</label>
            <textarea id="s-desc" name="description" minlength="10" required placeholder="${esc(t('support.descriptionPh'))}"></textarea></div>
          <div class="row" style="margin-top:14px;justify-content:flex-end">
            <button class="btn" type="submit">${icon('Paper_Plane')}${esc(t('support.submit'))}</button>
          </div>
        </form>
      </section>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('support.title'))}</h2></div>
        ${cases.length ? `<div class="card">${cases.map((c) => `<div class="list-item">
          <div class="row" style="align-items:flex-start"><div class="icon-badge ink">${icon('Headphones')}</div>
            <div><b>${esc(t(categoryKey(c.category)))}</b>
              <p class="muted small clamp-2">${esc(c.description)}</p>
              <p class="muted tiny">${esc(formatDateTime(c.createdAt))}</p></div></div>
          <span class="tag ${c.status === 'RESOLVED' ? 'done' : c.status === 'CLOSED' ? 'draft' : 'open'}">${esc(t(statusKey(c.status)))}</span>
        </div>`).join('')}</div>` : emptyState({ art: 'assets/illustrations/support.svg', title: t('support.noCases'), body: t('support.sub') })}
      </section>
    </div>`;
  return { body, chrome: 'app', active: 'account', after: () => {
    observeReveals();
    const form = document.querySelector('[data-role="support-form"]');
    if (form) form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      const data = Object.fromEntries(new FormData(event.currentTarget));
      setBusy(button, true);
      try {
        await api.createSupportCase({ category: data.category, description: data.description, bookingId: data.bookingId || undefined });
        toast(t('support.submitted'), 'success');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (error) { toast(t(errorKey(error)), 'error'); } finally { setBusy(button, false); }
    });
  } };
}

/* ======================= inbox ========================================== */
export async function inboxView(params, query = {}) {
  const state = getState();
  if (!state.user) return { redirect: '#/' };
  const tab = query.tab || 'chats';
  const notifications = state.notifications;
  let bookings = [];
  try { bookings = (await api.bookings()).bookings || []; } catch { bookings = []; }
  const conversations = bookings.filter((b) => b.worker || ['COMPLETED', 'CANCELLED'].includes(b.status)).slice(0, 12);

  const body = `
    <div class="stack-lg">
      <div class="page-head"><div><h1>${esc(t('inbox.title'))}</h1></div></div>
      <div class="segmented" role="tablist">
        <button role="tab" aria-selected="${tab === 'chats'}" data-action="inbox-tab" data-tab="chats">${esc(t('inbox.tabChats'))}</button>
        <button role="tab" aria-selected="${tab === 'alerts'}" data-action="inbox-tab" data-tab="alerts">${esc(t('inbox.tabAlerts'))}${unreadCount() ? ` (${unreadCount()})` : ''}</button>
      </div>

      ${tab === 'chats' ? `
        <section>
          ${conversations.length ? `<div class="card">${conversations.map((b) => {
            const service = serviceById((b.request || {}).service);
            const other = b.customerId === state.user.id ? b.worker : b.customer;
            return `<button class="list-item" data-action="open-chat" data-id="${esc(b.id)}" style="width:100%;text-align:left">
              <span class="row" style="align-items:flex-start">${avatar(other || {})}
                <span><b>${esc((other && other.name) || t('common.unknown'))}</b>
                  <span class="muted small" style="display:block">${esc(service ? (getLang() === 'en' ? service.en : service.bn) : (b.request || {}).service)} · ${esc(formatDate((b.request || {}).date))}</span>
                  <span class="muted tiny" style="display:block">${esc(t('inbox.sendPh'))}</span>
                </span></span>
              <span class="row" style="gap:8px">${statusTag(b.status)}${icon('Chevron_Right')}</span>
            </button>`;
          }).join('')}</div>`
            : emptyState({ art: 'assets/illustrations/empty-messages.svg', title: t('inbox.noChats'), body: t('inbox.noChatsBody'), action: `<a class="btn" href="#/explore">${esc(t('nav.explore'))}</a>` })}
        </section>`
      : `
        <section>
          ${notifications.length ? `
            <div class="row-between" style="margin-bottom:12px">
              <span class="muted small">${esc(t('inbox.tabAlerts'))}</span>
              <button class="btn ghost sm" data-action="mark-all-read">${esc(t('inbox.markRead'))}</button>
            </div>
            <div class="card">${notifications.map((n) => `<div class="list-item">
              <div class="row" style="align-items:flex-start">
                <div class="icon-badge ${n.read ? 'ink' : ''}">${icon(n.read ? 'Bell_Off' : 'Bell_Notification')}</div>
                <div><b>${esc(n.title || t('inbox.tabAlerts'))}</b>
                  <p class="muted small">${esc(n.body || '')}</p>
                  <p class="muted tiny">${esc(formatDateTime(n.createdAt))}</p></div>
              </div>
              ${n.bookingId ? `<button class="btn ghost sm" data-action="open-booking-detail" data-id="${esc(n.bookingId)}">${esc(t('activity.track'))}</button>` : ''}
            </div>`).join('')}</div>`
            : emptyState({ art: 'assets/illustrations/empty-messages.svg', title: t('inbox.noAlerts'), body: t('inbox.noAlertsBody') })}
        </section>`}
    </div>`;
  return { body, chrome: 'app', active: 'inbox', after: () => observeReveals() };
}

/* ======================= registrations ================================== */
register('new-address', () => addressSheet());
register('inbox-tab', (data) => navigate(`#/inbox?tab=${data.tab}`));
register('set-lang', (data) => { setLang(data.lang); api.updateMe({ preferredLanguage: data.lang }).catch(() => {}); });
register('toggle-availability', async (data, event, el) => {
  const available = el.checked;
  el.disabled = true;
  try {
    await api.availability(available);
    const user = getState().user;
    setState({ user: { ...user, available } });
    toast(available ? t('provider.active') : t('provider.paused'), 'success');
  } catch (error) {
    el.checked = !available;
    toast(t(errorKey(error)), 'error');
  } finally { el.disabled = false; }
});
register('toggle-notify', (data, event, el) => {
  setNotifyPref(el.checked);
  toast(t('account.notifications') + ': ' + (el.checked ? '✓' : '—'), 'info');
});
register('toggle-skill', (data, event, el) => {
  const on = el.getAttribute('aria-pressed') === 'true';
  el.setAttribute('aria-pressed', String(!on));
});
register('mark-all-read', async () => {
  const unread = getState().notifications.filter((n) => !n.read);
  try {
    await Promise.all(unread.map((n) => api.readNotification(n.id)));
    await refreshNotifications();
    toast(t('inbox.markRead'), 'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) { toast(t(errorKey(error)), 'error'); }
});
register('sign-out', async () => {
  const ok = await confirm({ title: t('account.signoutConfirm'), confirmLabel: t('account.signout'), danger: true });
  if (ok) await signOut();
});
