import test from "node:test";
import assert from "node:assert/strict";
import { parseSlackReply, parseDiscordResponse } from "../../remote-questions/format.ts";
import { resolveRemoteConfig, isValidChannelId } from "../../remote-questions/config.ts";

test("parseSlackReply handles single-number single-question answers", () => {
  const result = parseSlackReply("2", [{
    id: "choice",
    header: "Choice",
    question: "Pick one",
    allowMultiple: false,
    options: [
      { label: "Alpha", description: "A" },
      { label: "Beta", description: "B" },
    ],
  }]);

  assert.deepEqual(result, { answers: { choice: { answers: ["Beta"] } } });
});

test("parseSlackReply handles multiline multi-question answers", () => {
  const result = parseSlackReply("1\ncustom note", [
    {
      id: "first",
      header: "First",
      question: "Pick one",
      allowMultiple: false,
      options: [
        { label: "Alpha", description: "A" },
        { label: "Beta", description: "B" },
      ],
    },
    {
      id: "second",
      header: "Second",
      question: "Explain",
      allowMultiple: false,
      options: [
        { label: "Gamma", description: "G" },
        { label: "Delta", description: "D" },
      ],
    },
  ]);

  assert.deepEqual(result, {
    answers: {
      first: { answers: ["Alpha"] },
      second: { answers: [], user_note: "custom note" },
    },
  });
});

test("parseDiscordResponse handles single-question reactions", () => {
  const result = parseDiscordResponse([{ emoji: "2️⃣", count: 1 }], null, [{
    id: "choice",
    header: "Choice",
    question: "Pick one",
    allowMultiple: false,
    options: [
      { label: "Alpha", description: "A" },
      { label: "Beta", description: "B" },
    ],
  }]);

  assert.deepEqual(result, { answers: { choice: { answers: ["Beta"] } } });
});

test("parseDiscordResponse rejects multi-question reaction parsing", () => {
  const result = parseDiscordResponse([{ emoji: "1️⃣", count: 1 }], null, [
    {
      id: "first",
      header: "First",
      question: "Pick one",
      allowMultiple: false,
      options: [{ label: "Alpha", description: "A" }],
    },
    {
      id: "second",
      header: "Second",
      question: "Pick one",
      allowMultiple: false,
      options: [{ label: "Beta", description: "B" }],
    },
  ]);

  assert.match(String(result.answers.first.user_note), /single-question prompts/i);
  assert.match(String(result.answers.second.user_note), /single-question prompts/i);
});

test("parseSlackReply truncates user_note longer than 500 chars", () => {
  const longText = "x".repeat(600);
  const result = parseSlackReply(longText, [{
    id: "q1",
    header: "Q1",
    question: "Pick",
    allowMultiple: false,
    options: [{ label: "A", description: "a" }],
  }]);

  const note = result.answers.q1.user_note!;
  assert.ok(note.length <= 502, `note should be truncated, got ${note.length} chars`);
  assert.ok(note.endsWith("…"), "truncated note should end with ellipsis");
});

test("isValidChannelId rejects invalid Slack channel IDs", () => {
  // Too short
  assert.equal(isValidChannelId("slack", "C123"), false);
  // Contains invalid chars (URL injection)
  assert.equal(isValidChannelId("slack", "https://evil.com"), false);
  // Lowercase
  assert.equal(isValidChannelId("slack", "c12345678"), false);
  // Too long
  assert.equal(isValidChannelId("slack", "C1234567890AB"), false);
  // Valid: 9-12 uppercase alphanumeric
  assert.equal(isValidChannelId("slack", "C12345678"), true);
  assert.equal(isValidChannelId("slack", "C12345678AB"), true);
  assert.equal(isValidChannelId("slack", "C1234567890A"), true);
});

test("isValidChannelId rejects invalid Discord channel IDs", () => {
  // Too short
  assert.equal(isValidChannelId("discord", "12345"), false);
  // Contains letters (not a snowflake)
  assert.equal(isValidChannelId("discord", "abc12345678901234"), false);
  // URL injection
  assert.equal(isValidChannelId("discord", "https://evil.com"), false);
  // Too long (21 digits)
  assert.equal(isValidChannelId("discord", "123456789012345678901"), false);
  // Valid: 17-20 digit snowflake
  assert.equal(isValidChannelId("discord", "12345678901234567"), true);
  assert.equal(isValidChannelId("discord", "11234567890123456789"), true);
});

