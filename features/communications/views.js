import { escapeHtml } from "../../core.js?v=36";
import { actionToolbar, modalShell, renderList } from "../../modules/render.js?v=59";

function options(items, label) {
  return renderList(items, (item) => `<option value="${item.id}">${escapeHtml(label(item))}</option>`);
}

export function createCommunicationsViews({ getEvents, getEmailTemplates }) {
  function campaign() {
    const events = getEvents();
    const templates = getEmailTemplates();
    const firstEvent = events[0];
    const body = `
      <form id="campaign-form">
        <div class="split-fields"><label>Event<select name="event_id">${options(events, (event) => event.name)}</select></label><label>Campaign name<input name="name" placeholder="Final race instructions" required></label></div>
        <label>Start from a template<select name="template_id"><option value="">Blank message</option>${options(templates, (template) => template.name)}</select></label>
        <div class="split-fields"><label>Audience<select name="audience_type"><option value="confirmed">All confirmed participants</option><option value="tier">Specific registration option</option><option value="wave">Specific start wave</option><option value="team">Specific team</option><option value="captains">Team captains</option><option value="waitlist">Waitlist</option><option value="missing_bib">Missing bib</option><option value="checked_in">Checked in</option><option value="not_checked_in">Not checked in</option></select></label><label>Message type<select name="message_type"><option value="transactional">Transactional event message</option><option value="marketing">Marketing</option></select></label></div>
        <div class="split-fields"><label>Registration option<select name="tier_id"><option value="">Choose when needed</option>${options(firstEvent?.os_event_tiers || [], (tier) => tier.name)}</select></label><label>Start wave<select name="wave_id"><option value="">Choose when needed</option>${options(firstEvent?.os_waves || [], (wave) => wave.name)}</select></label></div>
        <label>Team<select name="team_id"><option value="">Choose when needed</option>${options(firstEvent?.os_teams || [], (team) => team.name)}</select></label>
        <label>Subject<input name="subject" required></label><label>Message<textarea name="html_body" rows="9" placeholder="<p>Hi {{first_name}}, ...</p>" required></textarea></label>
        <p class="template-help">Variables: <code>{{first_name}}</code> and <code>{{event_name}}</code></p>
        <label>Schedule <span class="optional-label">Leave blank for a draft</span><input name="scheduled_at" type="datetime-local"></label>
        <div id="audience-preview" class="audience-preview">Preview the audience before sending.</div>
        ${actionToolbar([
          { label: "Preview audience", attributes: 'name="campaign_intent" value="preview"', type: "submit" },
          { label: "Send test to me", attributes: 'name="campaign_intent" value="test"', type: "submit" },
          { label: "Save as template", attributes: 'name="campaign_intent" value="template"', type: "submit" },
          { label: "Save draft/schedule", attributes: 'name="campaign_intent" value="save"', type: "submit" },
          { label: "Send now", attributes: 'name="campaign_intent" value="send"', primary: true, type: "submit" },
        ])}
      </form>`;

    return modalShell({
      eyebrow: "Organizer communications",
      title: "Create a campaign",
      body,
      wide: true,
    }, escapeHtml);
  }

  return { campaign };
}
