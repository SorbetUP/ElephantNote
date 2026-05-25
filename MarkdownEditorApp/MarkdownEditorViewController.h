#import <Cocoa/Cocoa.h>

@interface MarkdownEditorViewController : NSViewController <NSTextViewDelegate>
- (BOOL)hasUnsavedChanges;
- (BOOL)confirmDiscardUnsavedChanges;
- (BOOL)saveCurrentDocument;
- (void)newDocument;
- (void)presentOpenPanel;
- (void)saveDocumentAs;
- (void)refreshUIState;
- (BOOL)openFile:(NSString *)filePath;
- (void)showSettingsPage;
- (void)selectVaultFolder;

@end
