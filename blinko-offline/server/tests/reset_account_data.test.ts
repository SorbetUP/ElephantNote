import { describe, expect, test } from "bun:test";

import { resetAccountDbData } from "../lib/reset_account_data";

describe("resetAccountDbData", () => {
  test("deletes account-scoped data in a safe order", async () => {
    const calls: string[] = [];
    const argsByCall: Record<string, any> = {};

    const tx: any = {
      accounts: {
        update: async (args: any) => {
          calls.push("accounts.update");
          argsByCall["accounts.update"] = args;
          return {};
        },
      },
      aiScheduledTask: {
        deleteMany: async (args: any) => {
          calls.push("aiScheduledTask.deleteMany");
          argsByCall["aiScheduledTask.deleteMany"] = args;
          return { count: 14 };
        },
      },
      notes: {
        findMany: async (args: any) => {
          calls.push("notes.findMany");
          argsByCall["notes.findMany"] = args;
          return [{ id: 1 }, { id: 2 }];
        },
        deleteMany: async (args: any) => {
          calls.push("notes.deleteMany");
          argsByCall["notes.deleteMany"] = args;
          return { count: 2 };
        },
      },
      attachments: {
        findMany: async (args: any) => {
          calls.push("attachments.findMany");
          argsByCall["attachments.findMany"] = args;
          return [{ path: "/api/file/a.png" }, { path: "/api/s3file/b.png" }];
        },
        deleteMany: async (args: any) => {
          calls.push("attachments.deleteMany");
          argsByCall["attachments.deleteMany"] = args;
          return { count: 2 };
        },
      },
      conversation: {
        findMany: async (args: any) => {
          calls.push("conversation.findMany");
          argsByCall["conversation.findMany"] = args;
          return [{ id: 10 }];
        },
        deleteMany: async (args: any) => {
          calls.push("conversation.deleteMany");
          argsByCall["conversation.deleteMany"] = args;
          return { count: 1 };
        },
      },
      message: {
        deleteMany: async (args: any) => {
          calls.push("message.deleteMany");
          argsByCall["message.deleteMany"] = args;
          return { count: 3 };
        },
      },
      tagsToNote: {
        deleteMany: async (args: any) => {
          calls.push("tagsToNote.deleteMany");
          argsByCall["tagsToNote.deleteMany"] = args;
          return { count: 4 };
        },
      },
      noteReference: {
        deleteMany: async (args: any) => {
          calls.push("noteReference.deleteMany");
          argsByCall["noteReference.deleteMany"] = args;
          return { count: 5 };
        },
      },
      comments: {
        deleteMany: async (args: any) => {
          calls.push("comments.deleteMany");
          argsByCall["comments.deleteMany"] = args;
          return { count: 6 };
        },
      },
      noteHistory: {
        deleteMany: async (args: any) => {
          calls.push("noteHistory.deleteMany");
          argsByCall["noteHistory.deleteMany"] = args;
          return { count: 7 };
        },
      },
      noteInternalShare: {
        deleteMany: async (args: any) => {
          calls.push("noteInternalShare.deleteMany");
          argsByCall["noteInternalShare.deleteMany"] = args;
          return { count: 8 };
        },
      },
      tag: {
        deleteMany: async (args: any) => {
          calls.push("tag.deleteMany");
          argsByCall["tag.deleteMany"] = args;
          return { count: 9 };
        },
      },
      syncChanges: {
        deleteMany: async (args: any) => {
          calls.push("syncChanges.deleteMany");
          argsByCall["syncChanges.deleteMany"] = args;
          return { count: 10 };
        },
      },
      notifications: {
        deleteMany: async (args: any) => {
          calls.push("notifications.deleteMany");
          argsByCall["notifications.deleteMany"] = args;
          return { count: 11 };
        },
      },
      follows: {
        deleteMany: async (args: any) => {
          calls.push("follows.deleteMany");
          argsByCall["follows.deleteMany"] = args;
          return { count: 12 };
        },
      },
      config: {
        deleteMany: async (args: any) => {
          calls.push("config.deleteMany");
          argsByCall["config.deleteMany"] = args;
          return { count: 13 };
        },
      },
    };

    const res = await resetAccountDbData(tx, 123);

    expect(res.noteIds).toEqual([1, 2]);
    expect(res.attachmentPaths).toEqual(["/api/file/a.png", "/api/s3file/b.png"]);
    expect(res.deleted.aiScheduledTasks).toBe(14);
    expect(res.deleted.notes).toBe(2);
    expect(res.deleted.attachments).toBe(2);

    expect(argsByCall["aiScheduledTask.deleteMany"]).toEqual({ where: { accountId: 123 } });
    expect(argsByCall["message.deleteMany"]).toEqual({ where: { conversationId: { in: [10] } } });
    expect(argsByCall["tagsToNote.deleteMany"]).toEqual({ where: { noteId: { in: [1, 2] } } });
    expect(argsByCall["comments.deleteMany"]).toEqual({ where: { OR: [{ accountId: 123 }, { noteId: { in: [1, 2] } }] } });
    expect(argsByCall["notes.deleteMany"]).toEqual({ where: { accountId: 123 } });
    expect(argsByCall["accounts.update"]).toEqual({ where: { id: 123 }, data: { note: 0 } });

    expect(calls).toEqual([
      "aiScheduledTask.deleteMany",
      "notes.findMany",
      "attachments.findMany",
      "conversation.findMany",
      "message.deleteMany",
      "conversation.deleteMany",
      "tagsToNote.deleteMany",
      "noteReference.deleteMany",
      "comments.deleteMany",
      "noteHistory.deleteMany",
      "noteInternalShare.deleteMany",
      "attachments.deleteMany",
      "notes.deleteMany",
      "tag.deleteMany",
      "syncChanges.deleteMany",
      "notifications.deleteMany",
      "follows.deleteMany",
      "config.deleteMany",
      "accounts.update",
    ]);
  });
});
