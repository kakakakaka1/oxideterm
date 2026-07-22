'use strict';

const { parseSections } = require('./issue_quality_policy.cjs');

const VERSION_REMINDER_MARKER = '<!-- oxideterm-stable-version-reminder:v1 -->';
const VERSION_SECTION_HEADING = 'oxideterm version / 版本';
const NON_STABLE_CHANNEL_PATTERN = /\b(?:alpha|beta|nightly|preview|rc|gpui|native|rustnative)\b/iu;
const REPORTED_VERSION_PATTERN = /(?:^|[^0-9A-Za-z.-])v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?(?=$|[^0-9A-Za-z.+-])/gu;
const STABLE_RELEASE_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/u;

function versionFromParts(parts) {
  return {
    major: Number(parts[1]),
    minor: Number(parts[2]),
    patch: Number(parts[3]),
    value: `${Number(parts[1])}.${Number(parts[2])}.${Number(parts[3])}`,
  };
}

function compareVersions(left, right) {
  for (const component of ['major', 'minor', 'patch']) {
    if (left[component] !== right[component]) {
      return left[component] - right[component];
    }
  }
  return 0;
}

function readReportedStableVersion(body) {
  const answer = parseSections(body).get(VERSION_SECTION_HEADING);
  if (!answer || NON_STABLE_CHANNEL_PATTERN.test(answer)) return null;

  // Ambiguous answers are skipped so the automation never guesses a channel.
  const matches = [...answer.matchAll(REPORTED_VERSION_PATTERN)];
  if (matches.length !== 1 || matches[0][4]) return null;
  return versionFromParts(matches[0]);
}

function stableVersionFromRelease(release) {
  if (release.draft || release.prerelease) return null;
  const match = String(release.tag_name || '').match(STABLE_RELEASE_TAG_PATTERN);
  if (!match) return null;
  return {
    ...versionFromParts(match),
    releaseUrl: release.html_url || null,
  };
}

function findLatestStableRelease(releases) {
  let latest = null;
  // Release API ordering is not a semantic-version guarantee, so compare all stable tags.
  for (const release of releases) {
    const candidate = stableVersionFromRelease(release);
    if (candidate && (!latest || compareVersions(candidate, latest) > 0)) {
      latest = candidate;
    }
  }
  return latest;
}

function findOutdatedStableVersion(body, releases) {
  const reported = readReportedStableVersion(body);
  const latest = findLatestStableRelease(releases);
  if (!reported || !latest || compareVersions(reported, latest) >= 0) return null;
  return { reported, latest };
}

function hasVersionReminder(comments) {
  return comments.some((comment) =>
    comment.user?.type === 'Bot'
      && (comment.body || '').includes(VERSION_REMINDER_MARKER)
  );
}

function buildVersionReminder({ reported, latest }) {
  const latestLabel = `v${latest.value}`;
  const latestReference = latest.releaseUrl
    ? `[${latestLabel}](${latest.releaseUrl})`
    : `**${latestLabel}**`;
  return [
    VERSION_REMINDER_MARKER,
    '## Stable version reminder / 稳定版版本提醒',
    '',
    `You reported **v${reported.value}**, while the latest stable release is ${latestReference}. Please update to the latest stable release and confirm whether the issue still occurs. If it does, reply here with the result.`,
    '',
    `你提交 Issue 时填写的是 **v${reported.value}**，当前最新稳定版为 ${latestReference}。请先更新到最新稳定版，再确认问题是否仍然存在；如果仍可复现，请在此 Issue 中补充结果。`,
  ].join('\n');
}

module.exports = {
  VERSION_REMINDER_MARKER,
  buildVersionReminder,
  compareVersions,
  findLatestStableRelease,
  findOutdatedStableVersion,
  hasVersionReminder,
  readReportedStableVersion,
  stableVersionFromRelease,
};
