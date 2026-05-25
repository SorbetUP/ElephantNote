import { userCaller } from '@server/routerTrpc/_app';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod/v3';
import { verifyToken } from '@server/lib/helper';

export const createCommentTool = createTool({
  id: 'create-comment-tool',
  description: 'Create a comment on a note. Use this to add comments to existing notes.',
  //@ts-ignore
  inputSchema: z.object({
    content: z.string().describe("The content of the comment"),
    noteId: z.number().describe("The ID of the note to comment on"),
    guestName: z.string().optional().describe("Optional guest name if not using an account"),
    token: z.string().optional().describe("internal use, do not pass!")
  }),
  execute: async ({ context, runtimeContext }) => {
    const accountId = runtimeContext?.get('accountId') || (await verifyToken(context.token))?.sub;
    
    try {
      const caller = userCaller({
        id: String(accountId),
        exp: 0,
        iat: 0,
        name: 'Blinko AI',
        sub: String(accountId),
        role: 'superadmin'
      });
      
      const result = await caller.comments.create({
        content: context.content,
        noteId: context.noteId,
        guestName: context.guestName || 'Blinko AI'
      });
      
      return { success: true, message: "Comment created successfully" };
    } catch (error) {
      console.log(error);
      return { success: false, error: error.message || "Unknown error occurred" };
    }
  }
});
