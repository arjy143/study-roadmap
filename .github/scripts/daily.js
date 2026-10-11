// Opens today's reminder issue (assigned to the repo owner, so GitHub emails and pushes it)
// and closes yesterday's. Run by .github/workflows/daily-reminder.yml via actions/github-script.
const fs = require("fs");

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const plan = JSON.parse(fs.readFileSync("plan.json", "utf8"));
  let progress = null;   // only exists once sync is turned on in the site
  try { progress = JSON.parse(fs.readFileSync("progress.json", "utf8")); } catch (_) {}

  // Today's date in London, regardless of the runner's UTC clock.
  const londonIso = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const today = process.env.FORCE_DATE || londonIso(new Date());
  const yDate = new Date(today + "T12:00:00Z"); yDate.setUTCDate(yDate.getUTCDate() - 1);
  const yesterday = yDate.toISOString().slice(0, 10);
  const pretty = new Date(today + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  const site = `https://${owner}.github.io/${repo}/`;
  const LABEL = "daily";

  // Close previous reminders.
  const open = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: "open", labels: LABEL, per_page: 100 });
  for (const i of open) {
    await github.rest.issues.update({ owner, repo, issue_number: i.number, state: "closed", state_reason: "completed" });
  }

  const day = plan.days[today];
  if (!day) {
    if (today > plan.end) core.notice(`Plan ended on ${plan.end}. Extend plan.json to keep reminders coming.`);
    return;
  }

  const week = plan.weeks.find((w) => w.n === day.week);
  const lines = [];
  const yd = plan.days[yesterday];
  if (progress && yd && !yd.rest && yd.tasks.length) {
    const done = yd.tasks.filter((t) => progress.tasks[t.id] && progress.tasks[t.id].v).length;
    lines.push(`_Yesterday: ${done}/${yd.tasks.length} done${done === yd.tasks.length ? " ✓" : ""}._`, "");
  }
  if (week) lines.push(`**Week ${week.n} · ${week.theme}** — ${week.goal}`, "");

  if (day.rest) {
    lines.push("Rest day. Nothing scheduled — properly rest.");
  } else {
    const slots = [["work", "At work · input"], ["home", "At home · output"], ["weekend", "Weekend"]];
    let total = 0;
    for (const [s, label] of slots) {
      const ts = day.tasks.filter((t) => t.slot === s);
      if (!ts.length) continue;
      lines.push(`#### ${label}`);
      for (const t of ts) {
        total += t.mins;
        lines.push(`- [ ] ${t.title} _(${t.mins}m)_${t.link ? ` — [link](${t.link})` : ""}`);
      }
      lines.push("");
    }
    lines.push(`About ${(total / 60).toFixed(1).replace(/\.0$/, "")}h in total.`);
  }
  lines.push("", `**[Open today on the roadmap →](${site}#/day/${today})** Tick things off there; this issue closes itself tomorrow.`);

  try { await github.rest.issues.getLabel({ owner, repo, name: LABEL }); }
  catch (_) { await github.rest.issues.createLabel({ owner, repo, name: LABEL, color: "e8b04b", description: "Daily roadmap reminder" }); }

  const issue = await github.rest.issues.create({
    owner, repo,
    title: `${day.rest ? "Rest day" : "Today"} · ${pretty}${week ? ` · W${week.n}` : ""}`,
    body: lines.join("\n"),
    labels: [LABEL],
    assignees: [owner],
  });
  core.notice(`Opened #${issue.data.number} for ${today}`);
};
