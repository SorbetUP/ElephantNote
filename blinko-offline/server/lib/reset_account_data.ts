export type ResetAccountDbStats = {
  noteIds: number[];
  attachmentPaths: string[];
  deleted: {
    aiScheduledTasks: number;
    messages: number;
    conversations: number;
    tagsToNote: number;
    noteReferences: number;
    comments: number;
    noteHistories: number;
    noteInternalShares: number;
    attachments: number;
    notes: number;
    tags: number;
    syncChanges: number;
    notifications: number;
    follows: number;
    configs: number;
  };
};

type DeleteManyResult = { count: number };

export type ResetAccountDbClient = {
  accounts: { update(args: any): Promise<any> };
  aiScheduledTask: { deleteMany(args: any): Promise<DeleteManyResult> };
  notes: { findMany(args: any): Promise<Array<{ id: number }>>; deleteMany(args: any): Promise<DeleteManyResult> };
  attachments: { findMany(args: any): Promise<Array<{ path: string }>>; deleteMany(args: any): Promise<DeleteManyResult> };
  tagsToNote: { deleteMany(args: any): Promise<DeleteManyResult> };
  noteReference: { deleteMany(args: any): Promise<DeleteManyResult> };
  comments: { deleteMany(args: any): Promise<DeleteManyResult> };
  noteHistory: { deleteMany(args: any): Promise<DeleteManyResult> };
  noteInternalShare: { deleteMany(args: any): Promise<DeleteManyResult> };
  tag: { deleteMany(args: any): Promise<DeleteManyResult> };
  syncChanges: { deleteMany(args: any): Promise<DeleteManyResult> };
  notifications: { deleteMany(args: any): Promise<DeleteManyResult> };
  follows: { deleteMany(args: any): Promise<DeleteManyResult> };
  config: { deleteMany(args: any): Promise<DeleteManyResult> };
  conversation: { findMany(args: any): Promise<Array<{ id: number }>>; deleteMany(args: any): Promise<DeleteManyResult> };
  message: { deleteMany(args: any): Promise<DeleteManyResult> };
};

export async function resetAccountDbData(tx: ResetAccountDbClient, accountId: number): Promise<ResetAccountDbStats> {
  const deletedAiScheduledTasks = await tx.aiScheduledTask.deleteMany({ where: { accountId } });

  const notes = await tx.notes.findMany({
    where: { accountId },
    select: { id: true },
  });
  const noteIds = notes.map(n => n.id);

  const attachments = await tx.attachments.findMany({
    where: {
      OR: [
        { accountId },
        ...(noteIds.length ? [{ noteId: { in: noteIds } }] : []),
      ],
    },
    select: { path: true },
  });
  const attachmentPaths = attachments.map(a => a.path).filter(Boolean);

  const conversations = await tx.conversation.findMany({
    where: { accountId },
    select: { id: true },
  });
  const conversationIds = conversations.map(c => c.id);

  const deletedMessages = await tx.message.deleteMany({
    where: conversationIds.length ? { conversationId: { in: conversationIds } } : { conversationId: { in: [] } },
  });
  const deletedConversations = await tx.conversation.deleteMany({ where: { accountId } });

  const deletedTagsToNote = await tx.tagsToNote.deleteMany({
    where: noteIds.length ? { noteId: { in: noteIds } } : { noteId: { in: [] } },
  });

  const deletedNoteReferences = await tx.noteReference.deleteMany({
    where: noteIds.length
      ? { OR: [{ fromNoteId: { in: noteIds } }, { toNoteId: { in: noteIds } }] }
      : { OR: [{ fromNoteId: { in: [] } }, { toNoteId: { in: [] } }] },
  });

  const deletedComments = await tx.comments.deleteMany({
    where: noteIds.length
      ? { OR: [{ accountId }, { noteId: { in: noteIds } }] }
      : { OR: [{ accountId }, { noteId: { in: [] } }] },
  });

  const deletedNoteHistories = await tx.noteHistory.deleteMany({
    where: { accountId },
  });

  const deletedNoteInternalShares = await tx.noteInternalShare.deleteMany({
    where: { accountId },
  });

  const deletedAttachments = await tx.attachments.deleteMany({
    where: {
      OR: [
        { accountId },
        ...(noteIds.length ? [{ noteId: { in: noteIds } }] : []),
      ],
    },
  });

  const deletedNotes = await tx.notes.deleteMany({ where: { accountId } });
  const deletedTags = await tx.tag.deleteMany({ where: { accountId } });
  const deletedSyncChanges = await tx.syncChanges.deleteMany({ where: { accountId } });
  const deletedNotifications = await tx.notifications.deleteMany({ where: { accountId } });
  const deletedFollows = await tx.follows.deleteMany({ where: { accountId } });
  const deletedConfigs = await tx.config.deleteMany({ where: { userId: accountId } });

  await tx.accounts.update({
    where: { id: accountId },
    data: { note: 0 },
  });

  return {
    noteIds,
    attachmentPaths,
    deleted: {
      aiScheduledTasks: deletedAiScheduledTasks.count,
      messages: deletedMessages.count,
      conversations: deletedConversations.count,
      tagsToNote: deletedTagsToNote.count,
      noteReferences: deletedNoteReferences.count,
      comments: deletedComments.count,
      noteHistories: deletedNoteHistories.count,
      noteInternalShares: deletedNoteInternalShares.count,
      attachments: deletedAttachments.count,
      notes: deletedNotes.count,
      tags: deletedTags.count,
      syncChanges: deletedSyncChanges.count,
      notifications: deletedNotifications.count,
      follows: deletedFollows.count,
      configs: deletedConfigs.count,
    },
  };
}
