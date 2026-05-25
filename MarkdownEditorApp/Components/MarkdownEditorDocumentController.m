#import "MarkdownEditorDocumentController.h"
#import "MarkdownDocumentIO.h"
#import "MarkdownEditorDocument.h"

@interface MarkdownEditorDocumentController ()
@property (strong, nonatomic) NSTextView *textView;
@property (strong, nonatomic) MarkdownDocumentIO *documentIO;
@property (strong, nonatomic, readwrite) MarkdownEditorDocument *document;
- (BOOL)saveFile:(NSString *)filePath;
@end

@implementation MarkdownEditorDocumentController

- (instancetype)initWithTextView:(NSTextView *)textView
                       documentIO:(MarkdownDocumentIO *)documentIO {
    self = [super init];
    if (self) {
        _textView = textView;
        _documentIO = documentIO;
        _document = [[MarkdownEditorDocument alloc] init];
    }
    return self;
}

- (BOOL)hasUnsavedChanges {
    return self.document.dirty;
}

- (void)refreshUIState {
    if (self.refreshUIStateBlock) {
        self.refreshUIStateBlock();
    }
}

- (void)newDocument {
    if (![self confirmDiscardUnsavedChanges]) {
        return;
    }
    [self startFreshDocumentWithContent:@"" filePath:nil];
    [self.textView setSelectedRange:NSMakeRange(0, 0)];
    [self.textView.window makeFirstResponder:self.textView];
}

- (void)presentOpenPanel {
    if (![self confirmDiscardUnsavedChanges]) {
        return;
    }
    NSString *path = [self.documentIO presentOpenPanel];
    if (path.length > 0) {
        [self openFile:path];
    }
}

- (BOOL)saveCurrentDocument {
    if (self.document.filePath.length > 0) {
        return [self saveFile:self.document.filePath];
    }
    [self saveDocumentAs];
    return self.document.filePath.length > 0;
}

- (void)saveDocumentAs {
    NSString *defaultName = self.document.filePath.length > 0 ? self.document.filePath.lastPathComponent : @"document.md";
    NSString *path = [self.documentIO presentSavePanelWithDefaultName:defaultName];
    if (path.length > 0) {
        [self saveFile:path];
    }
}

- (BOOL)openFile:(NSString *)filePath {
    NSError *error = nil;
    NSString *content = [self.documentIO readStringFromFile:filePath error:&error];
    if (error) {
        NSLog(@"❌ Failed to open file: %@", error.localizedDescription);
        return NO;
    }
    [self startFreshDocumentWithContent:content filePath:filePath];
    NSLog(@"✅ Opened file: %@", filePath);
    return YES;
}

- (void)updateLineContents {
    [self.document updateLineContentsFromContent:self.textView.string];
}

- (BOOL)updateCursorLineIndex {
    return [self.document updateCursorLineIndexForContent:self.textView.string
                                           cursorLocation:self.textView.selectedRange.location];
}

- (BOOL)confirmDiscardUnsavedChanges {
    return !self.document.dirty || [self.documentIO confirmDiscardUnsavedChanges];
}

- (BOOL)saveFile:(NSString *)filePath {
    NSError *error = nil;
    BOOL ok = [self.documentIO writeString:self.textView.string toFile:filePath error:&error];
    if (!ok || error) {
        NSLog(@"❌ Failed to save file: %@", error.localizedDescription);
        return NO;
    }
    self.document.filePath = [filePath copy];
    [self.document markSaved];
    if (self.refreshUIStateBlock) {
        self.refreshUIStateBlock();
    }
    return YES;
}

- (void)startFreshDocumentWithContent:(NSString *)content filePath:(NSString *)filePath {
    [self.document replaceContent:content filePath:filePath dirty:NO];
    self.textView.string = content ?: @"";
    if ([self.textView respondsToSelector:@selector(setMarkdownSource:)]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        [self.textView performSelector:@selector(setMarkdownSource:) withObject:(content ?: @"")];
#pragma clang diagnostic pop
    }
    [self updateLineContents];
    [self refreshUIState];
    if ([self.textView respondsToSelector:@selector(forceRender)]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.textView performSelector:@selector(forceRender)];
        });
#pragma clang diagnostic pop
    }
}

@end
