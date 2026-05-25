#import <Cocoa/Cocoa.h>

@class MarkdownEditorDocument;
@class MarkdownDocumentIO;

@interface MarkdownEditorDocumentController : NSObject

@property (strong, nonatomic, readonly) MarkdownEditorDocument *document;
@property (copy, nonatomic) void (^refreshUIStateBlock)(void);

- (instancetype)init NS_UNAVAILABLE;
- (instancetype)initWithTextView:(NSTextView *)textView
                       documentIO:(MarkdownDocumentIO *)documentIO NS_DESIGNATED_INITIALIZER;

- (BOOL)hasUnsavedChanges;
- (void)refreshUIState;
- (BOOL)confirmDiscardUnsavedChanges;
- (void)newDocument;
- (void)presentOpenPanel;
- (BOOL)saveCurrentDocument;
- (void)saveDocumentAs;
- (BOOL)openFile:(NSString *)filePath;
- (void)updateLineContents;
- (BOOL)updateCursorLineIndex;

@end
