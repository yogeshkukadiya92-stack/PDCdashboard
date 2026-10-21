/* Calendar credentials stay on the server; this workspace only receives safe metadata. */
(() => {
  let data,
    leads = [];
  const e = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const button = (a, label, id = "") =>
    `<button type="button" class="ghost-button" data-calendar="${a}" data-id="${e(id)}">${e(label)}</button>`;
  const post = (a, b) =>
    api("/api/calendar/" + a, { method: "POST", body: JSON.stringify(b) });
  const date = (v) =>
    new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const local = (v) =>
    v
      ? new Date(new Date(v).getTime() + 330 * 60000).toISOString().slice(0, 16)
      : "";
  const options = (items, value) =>
    items
      .map(
        (x) =>
          `<option value="${e(x.id)}" ${x.id === value ? "selected" : ""}>${e(x.name)}</option>`,
      )
      .join("");
  function render() {
    const el = document.querySelector("#calendarWorkspace");
    if (!el) return;
    if (!data) {
      el.textContent = "Loading meetings…";
      return;
    }
    el.innerHTML = `<h3>Meetings & Google Calendar</h3><p>Create, reschedule or cancel a meeting here to update Google Calendar. Times are shown in IST. Changes made directly in Google Calendar are not imported.</p>${!data.configured ? '<p role="status"><strong>Google Calendar setup required.</strong> The server administrator must configure Google OAuth before accounts can be connected.</p>' : ""}<div class="crm-row-actions">${data.configured ? button("connect", "Connect Google Calendar") : ""}${data.connections.some((c) => c.calendarId) ? button("new", "+ New meeting") : ""}${button("refresh", "Refresh")}</div><h3>My connected calendars</h3>${data.connections.map((c) => `<div class="panel crm-panel"><strong>${e(c.label)}</strong><p>${e(c.calendarName || "Choose a calendar to finish connecting")}</p>${button("select", "Choose calendar", c.id)}${button("reconnect", "Reconnect", c.id)}${button("disconnect", "Disconnect", c.id)}</div>`).join("") || "<p>No Google Calendar connected yet.</p>"}<h3>Meetings${currentUser.role === "admin" ? " — all team members" : ""}</h3><div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Meeting</th><th>Time (IST)</th><th>Status</th><th>Actions</th></tr></thead><tbody>${
      data.meetings
        .sort((a, b) => b.start.localeCompare(a.start))
        .map(
          (m) =>
            `<tr><td><strong>${e(m.title)}</strong><br>${e(m.location)}</td><td>${e(date(m.start))}<br>to ${e(date(m.end))}</td><td>${m.cancelled ? "Cancelled · " : ""}${e(m.syncStatus)}${m.syncError ? "<br>" + e(m.syncError) : ""}</td><td>${m.googleUrl && /^https:\/\/([a-z0-9-]+\.)?google\.com\//i.test(m.googleUrl) ? `<a href="${e(m.googleUrl)}" target="_blank" rel="noopener noreferrer">Open Google Calendar</a>` : ""}${m.ownerId === currentUser.id ? `${!m.cancelled ? button("edit", "Edit", m.id) + button("cancel", "Cancel meeting", m.id) : ""}${m.syncStatus !== "synced" ? button("retry", "Retry sync", m.id) : ""}` : ""}</td></tr>`,
        )
        .join("") || '<tr><td colspan="4">No meetings yet.</td></tr>'
    }</tbody></table></div>`;
  }
  async function refresh(state) {
    if (state) leads = state.leads || [];
    data = await api("/api/calendar");
    render();
  }
  window.calendarRefresh = refresh;
  window.calendarMount = () => {
    render();
    refresh().catch((err) => {
      const el = document.querySelector("#calendarWorkspace");
      if (el) el.textContent = err.message;
    });
  };
  function dialog(title, html, submit, handler) {
    const d = document.querySelector("#crmDialog");
    if (d.open) d.close();
    d.innerHTML = `<div class="crm-dialog-heading"><h3>${e(title)}</h3>${button("close", "Close")}</div><form><div class="crm-form-grid">${html}</div><p role="alert" id="calendarError"></p><div class="crm-dialog-footer">${button("close", "Back")}<button class="primary-button">${e(submit)}</button></div></form>`;
    d.showModal();
    d.querySelector("form").onsubmit = async (ev) => {
      ev.preventDefault();
      ev.submitter.disabled = true;
      try {
        await handler(Object.fromEntries(new FormData(ev.target)));
        d.close();
        await refresh();
      } catch (err) {
        d.querySelector("#calendarError").textContent = err.message;
      } finally {
        ev.submitter.disabled = false;
      }
    };
  }
  document.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-calendar]");
    if (!t) return;
    const a = t.dataset.calendar,
      id = t.dataset.id;
    t.disabled = true;
    try {
      if (a === "close") document.querySelector("#crmDialog").close();
      if (a === "refresh") await refresh();
      if (a === "connect" || a === "reconnect")
        dialog(
          "Connect Google Calendar",
          '<label>Connection name<input name="label" required maxlength="100" placeholder="e.g. Sales meetings"></label><p>You will choose your Google account and grant Calendar access on Google. Meeting title, notes, location and times are sent to the calendar you select.</p>',
          "Continue to Google",
          async (b) => {
            const r = await post("connect", {
              ...b,
              connectionId: id || undefined,
            });
            location.assign(r.authorizationUrl);
          },
        );
      if (a === "select") {
        const r = await post("calendars", { connectionId: id });
        if (!r.calendars.length)
          throw new Error("No writable calendars available in this account.");
        dialog(
          "Choose Google Calendar",
          `<label>Calendar<select name="calendarId">${options(r.calendars, data.connections.find((c) => c.id === id)?.calendarId)}</select></label>`,
          "Save",
          (b) => post("select", { ...b, connectionId: id }),
        );
      }
      if (a === "disconnect")
        dialog(
          "Disconnect calendar",
          "<p>Stop syncing this connection. Existing Google events will remain. Meetings using this connection cannot be changed here after disconnecting.</p>",
          "Disconnect",
          () => post("disconnect", { connectionId: id }),
        );
      if (a === "new" || a === "edit") {
        const m = data.meetings.find((x) => x.id === id) || {};
        const cs = data.connections
          .filter((c) => c.calendarId)
          .map((c) => ({ id: c.id, name: c.label + " — " + c.calendarName }));
        dialog(
          a === "new" ? "New meeting" : "Edit meeting",
          `<label>Title<input name="title" value="${e(m.title)}" required maxlength="200"></label><label>Calendar<select name="connectionId" ${id ? "disabled" : ""}>${options(cs, m.connectionId)}</select></label><label>Start (IST)<input type="datetime-local" name="start" value="${local(m.start)}" required></label><label>End (IST)<input type="datetime-local" name="end" value="${local(m.end)}" required></label><label>Lead (optional)<select name="leadId"><option value="">No linked lead</option>${options(
            leads.map((l) => ({ id: l.id, name: l.name })),
            m.leadId,
          )}</select></label><label>Location / meeting link<input name="location" value="${e(m.location)}" maxlength="300"></label><label>Meeting notes<textarea name="notes" maxlength="3000">${e(m.notes)}</textarea></label><p>These meeting details will be saved to the selected Google Calendar. No guest invitations are sent.</p>`,
          "Save & sync",
          async (b) => {
            const r = await post("meeting", {
              ...b,
              id: id || undefined,
              start: b.start + ":00+05:30",
              end: b.end + ":00+05:30",
            });
            showToast(
              r.syncStatus === "synced"
                ? "Meeting synced with Google Calendar."
                : r.syncError,
            );
          },
        );
      }
      if (a === "cancel")
        dialog(
          "Cancel meeting",
          "<p>This also removes this dashboard-created meeting from Google Calendar.</p>",
          "Cancel meeting",
          async () => {
            const r = await post("cancel", { id });
            showToast(
              r.syncStatus === "synced"
                ? "Meeting cancelled in Google Calendar."
                : r.syncError,
            );
          },
        );
      if (a === "retry") {
        const r = await post("retry", { id });
        showToast(
          r.syncStatus === "synced" ? "Google Calendar updated." : r.syncError,
        );
        await refresh();
      }
    } catch (err) {
      showToast(err.message);
    } finally {
      t.disabled = false;
    }
  });
})();
