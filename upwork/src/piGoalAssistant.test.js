import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GOAL_ASSISTANT_SYSTEM_PROMPT,
  buildGoalAssistantPrompt,
  refineGoalWithPi,
} from './piGoalAssistant.js';
import { extractJsonValue, extractPiEventText } from './piCli.js';

const project = {
  name: 'Personal Agent',
  description: 'Local automation dashboard.',
  directory: '/tmp/personal-agent',
};

test('builds a project-grounded goal conversation prompt', () => {
  const prompt = buildGoalAssistantPrompt({
    project,
    messages: [{ role: 'user', content: 'Investigate the dashboard and refine this.' }],
    draft: { title: 'Improve planning', status: 'backlog', priority: 'high' },
  });
  assert.match(prompt, /Working directory: \/tmp\/personal-agent/);
  assert.match(prompt, /Improve planning/);
  assert.match(prompt, /Investigate the dashboard/);
  assert.match(GOAL_ASSISTANT_SYSTEM_PROMPT, /read, grep, find, and ls/);
  assert.match(GOAL_ASSISTANT_SYSTEM_PROMPT, /Never attempt to edit, write, delete, execute commands/);
});

test('returns validated field updates from the read-only PI assistant', async () => {
  let receivedOptions;
  const response = await refineGoalWithPi({
    project,
    messages: [{ role: 'user', content: 'Apply a clear goal.' }],
    draft: {},
  }, {
    runPrompt: async (_prompt, options) => {
      receivedOptions = options;
      return {
        model: 'test/model',
        stdout: JSON.stringify({
          reply: 'I grounded the goal in the current dashboard.',
          updates: {
            title: 'Make project planning agent-ready',
            outcome: 'Users can define repository-grounded work with PI.',
            completionCriteria: 'The assistant can inspect and fill the goal fields.',
            nonGoals: 'No repository writes from PI.',
            priority: 'high',
            status: 'planned',
          },
          investigation: { summary: 'Reviewed the dashboard structure.', files: ['dashboard/src/planningBoard.jsx', '../secret'] },
        }),
      };
    },
  });

  assert.equal(receivedOptions.cwd, project.directory);
  assert.equal(receivedOptions.systemPrompt, GOAL_ASSISTANT_SYSTEM_PROMPT);
  assert.equal(response.updates.priority, 'high');
  assert.equal(response.updates.status, 'planned');
  assert.deepEqual(response.investigation.files, ['dashboard/src/planningBoard.jsx']);
});

test('keeps useful PI updates when the model omits its conversational reply', async () => {
  const response = await refineGoalWithPi({
    project,
    messages: [{ role: 'user', content: 'Refine the current draft.' }],
    draft: {},
  }, {
    runPrompt: async () => ({
      model: 'test/model',
      stdout: JSON.stringify({
        reply: '',
        updates: {
          title: 'Test the lane classifier',
          outcome: 'The lane classifier behavior is protected by automated tests.',
        },
        investigation: { summary: 'Found the classifier and test command.', files: ['src/positioningLanes.js'] },
      }),
    }),
  });

  assert.equal(response.reply, 'I reviewed the goal and updated title and outcome.');
  assert.equal(response.updates.title, 'Test the lane classifier');
  assert.equal(response.investigation.summary, 'Found the classifier and test command.');
});

test('extracts the final assistant text from PI JSON event output', () => {
  const output = [
    JSON.stringify({ type: 'message_update', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'Inspecting' }] } }),
    JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'Done' }, { type: 'text', text: '{"reply":"Ready"}' }] } }),
  ].join('\n');
  assert.equal(extractPiEventText(output), '{"reply":"Ready"}');
});

test('extracts the substantive object when PI emits multiple JSON values', () => {
  const output = '{}\n' + JSON.stringify({
    reply: 'I refined the goal.',
    updates: { title: 'Protect the lane classifier with tests' },
  });
  assert.deepEqual(extractJsonValue(output, 'object'), {
    reply: 'I refined the goal.',
    updates: { title: 'Protect the lane classifier with tests' },
  });
});

test('extracts nested JSON from fences without merging surrounding values', () => {
  const output = 'Draft: {"ignored":true}\n```json\n[{"id":"1","meta":{"lane":"trading"}}]\n```';
  assert.deepEqual(extractJsonValue(output, 'array'), [{ id: '1', meta: { lane: 'trading' } }]);
});
