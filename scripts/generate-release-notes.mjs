import { execFileSync } from 'node:child_process';

const currentTag = process.argv[2] || process.env.CURRENT_TAG;

function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function getPreviousTag(tag) {
  const tags = runGit(['tag', '--sort=-version:refname']).split('\n').filter(Boolean);
  const currentIndex = tags.indexOf(tag);

  if (currentIndex === -1) {
    return tags[0] || '';
  }

  return tags[currentIndex + 1] || '';
}

function groupName(type) {
  switch (type) {
    case 'feat':
      return '新增';
    case 'fix':
      return '修复';
    case 'perf':
      return '性能优化';
    case 'refactor':
      return '重构';
    case 'docs':
      return '文档';
    case 'test':
      return '测试';
    case 'ci':
    case 'build':
    case 'chore':
      return '工程';
    default:
      return '其他';
  }
}

function parseCommitMessage(message) {
  const pattern = /^(?<type>[a-zA-Z]+)(\((?<scope>[^)]+)\))?(?<breaking>!)?: (?<subject>.+)$/;
  const match = message.match(pattern);

  if (!match?.groups) {
    return { type: '其他', subject: message, breaking: false };
  }

  return {
    type: groupName(match.groups.type.toLowerCase()),
    subject: match.groups.subject.trim(),
    breaking: Boolean(match.groups.breaking),
  };
}

function buildReleaseNotes(tag) {
  const previousTag = getPreviousTag(tag);
  const range = previousTag ? `${previousTag}..${tag}` : tag;
  const rawCommits = runGit(['log', '--no-merges', '--pretty=format:%s', range])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (rawCommits.length === 0) {
    return `## ${tag}\n\n暂无可自动生成的 release note。`;
  }

  const sections = new Map();
  const breakingChanges = [];

  for (const message of rawCommits) {
    const parsed = parseCommitMessage(message);

    if (parsed.breaking || /BREAKING CHANGE/i.test(message)) {
      breakingChanges.push(parsed.subject);
    }

    if (!sections.has(parsed.type)) {
      sections.set(parsed.type, []);
    }

    sections.get(parsed.type).push(parsed.subject);
  }

  const orderedSectionNames = ['新增', '修复', '性能优化', '重构', '文档', '测试', '工程', '其他'];
  const lines = [`## ${tag}`];

  if (previousTag) {
    lines.push('', `**变更范围**: ${previousTag} -> ${tag}`);
  }

  for (const sectionName of orderedSectionNames) {
    const items = sections.get(sectionName);
    if (!items || items.length === 0) {
      continue;
    }

    lines.push('', `### ${sectionName}`);
    for (const item of items) {
      lines.push(`- ${item}`);
    }
  }

  if (breakingChanges.length > 0) {
    lines.push('', '### 重大变更');
    for (const item of breakingChanges) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join('\n');
}

if (!currentTag) {
  console.error('Missing tag name. Pass the current tag as the first argument or via CURRENT_TAG.');
  process.exit(1);
}

try {
  process.stdout.write(buildReleaseNotes(currentTag));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
