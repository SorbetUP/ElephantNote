module.exports = {
  types: [
    { types: ["feat", "feature","✨feat"], label: "✨ New Features" },
    { types: ["fix", "bugfix","🐛fix"], label: "🐛 Bugfixes" },
    { types: ["improvements", "enhancement","🚀improvements"], label: "🚀 Improvements" },
    { types: ["perf","⚡️perf"], label: "⚡️ Performance Improvements" },
    { types: ["build", "ci","🏗️build"], label: "🏗️ Build System" },
    { types: ["refactor","♻️refactor"], label: "♻️ Refactors" },
    { types: ["doc", "docs","📝docs"], label: "📝 Documentation Changes" },
    { types: ["test", "tests","✅tests"], label: "✅ Tests" },
    { types: ["style","💄style"], label: "💄 Code Style Changes" },
    { types: ["chore","🔧chore"], label: "🔧 Chores" },
    { types: ["other","🔍other"], label: "🔍 Other Changes" },
  ],
  renderTypeSection: function (label, commits) {
    let text = `\n### ${label}\n`;
    commits.forEach(commit => {
      text += `- ${commit.subject} ${commit.url}\n`;
    });
    return text;
  }
}; 