#import "MarkdownEditorViewController.h"
#import "Components/MarkdownEditorChromeView.h"
#import "Components/MarkdownEditorDocumentController.h"
#import "Components/MarkdownEditorDocument.h"
#import "Components/MarkdownDocumentIO.h"
#import "Components/NoteEmbeddingSearch.h"
#import <WebKit/WebKit.h>

@interface MarkdownEditorViewController () <WKScriptMessageHandler, WKNavigationDelegate>
- (NSString *)displayNameForCurrentDocument;
- (void)refreshUIState;
@property (assign, nonatomic) NSInteger currentPageIndex;
@property (strong, nonatomic) MarkdownEditorDocumentController *documentController;
@property (strong, nonatomic) MarkdownEditorChromeView *chromeView;

@property (strong, nonatomic) NSView *headerView;
@property (strong, nonatomic) NSTextField *titleLabel;
@property (strong, nonatomic) NSView *statusView;
@property (strong, nonatomic) NSView *statusIndicator;
@property (strong, nonatomic) NSTextField *statusLabel;
@property (strong, nonatomic) NSButton *captureNavButton;
@property (strong, nonatomic) NSButton *libraryNavButton;
@property (strong, nonatomic) NSButton *vaultNavButton;
@property (strong, nonatomic) NSScrollView *scrollView;
@property (strong, nonatomic) NSTextView *textView;
@property (strong, nonatomic) NSSegmentedControl *writingModeControl;
@property (strong, nonatomic) NSStackView *notesGridStack;
@property (strong, nonatomic) NSSearchField *noteSearchField;
@property (strong, nonatomic) NSTextField *notesSummaryLabel;
@property (strong, nonatomic) NSButton *createButton;
@property (strong, nonatomic) NSButton *vaultButton;
@property (strong, nonatomic) NSButton *openButton;
@property (strong, nonatomic) NSButton *saveButton;
@property (strong, nonatomic) NSButton *deleteNoteButton;
@property (strong, nonatomic) NSTextField *vaultPathLabel;
@property (strong, nonatomic) NSTextField *vaultSummaryLabel;
@property (strong, nonatomic) NSButton *vaultSelectButton;
@property (strong, nonatomic) NSButton *vaultSaveButton;
@property (strong, nonatomic) NSButton *settingsBackButton;
@property (strong, nonatomic) NSView *contentContainer;
@property (strong, nonatomic) NSView *editorPane;
@property (strong, nonatomic) NSMutableArray<NSMutableDictionary *> *notes;
@property (copy, nonatomic) NSString *vaultPath;
@property (assign, nonatomic) NSInteger selectedNoteIndex;
@property (assign, nonatomic) BOOL suppressChangeTracking;
@property (assign, nonatomic) NoteEmbeddingIndex *noteSearchIndex;
@property (assign, nonatomic) BOOL noteSearchIndexDirty;
@property (assign, nonatomic) BOOL editorFullPageMode;
@property (assign, nonatomic) NSInteger previousContentPageIndex;
@property (strong, nonatomic) WKWebView *webView;
@property (assign, nonatomic) BOOL webUIReady;
@end

static NSString * const MarkdownEditorStoredNotesKey = @"MarkdownEditorStoredNotes";
static NSString * const MarkdownEditorVaultPathKey = @"MarkdownEditorVaultPath";
static NSString * const MarkdownEditorFullPageWritingModeKey = @"MarkdownEditorFullPageWritingMode";
static NSInteger const MarkdownEditorPageCapture = 0;
static NSInteger const MarkdownEditorPageLibrary = 1;
static NSInteger const MarkdownEditorPageVault = 2;

@implementation MarkdownEditorViewController

- (void)viewDidLoad {
    [super viewDidLoad];

    NSLog(@"🚀 Starting C Markdown Editor...");

    [self setupUI];
    [self initializeComponents];
    [self initializeVaultPath];
    [self loadDefaultContent];
    [self refreshUIState];

    NSLog(@"✅ C Markdown Editor initialized successfully");
}

#pragma mark - C Engine Integration

- (void)initializeComponents {
    NSLog(@"🔧 Initializing editor components...");
    MarkdownDocumentIO *documentIO = [[MarkdownDocumentIO alloc] init];
    __weak MarkdownEditorViewController *weakSelf = self;
    self.documentController = [[MarkdownEditorDocumentController alloc] initWithTextView:self.textView
                                                                               documentIO:documentIO];
    self.documentController.refreshUIStateBlock = ^{
        [weakSelf refreshUIState];
    };
    self.suppressChangeTracking = NO;
    self.noteSearchIndex = nes_create(NES_DEFAULT_DIMENSIONS);
    self.noteSearchIndexDirty = YES;
    NSLog(@"✅ Editor components ready");
}

#pragma mark - UI Setup

- (void)setupUI {
    self.chromeView = [[MarkdownEditorChromeView alloc] initWithFrame:NSZeroRect];
    self.view = self.chromeView;
    self.headerView = self.chromeView.headerView;
    self.titleLabel = self.chromeView.titleLabel;
    self.statusView = self.chromeView.statusView;
    self.statusIndicator = self.chromeView.statusIndicator;
    self.statusLabel = self.chromeView.statusLabel;
    self.captureNavButton = self.chromeView.captureNavButton;
    self.libraryNavButton = self.chromeView.libraryNavButton;
    self.vaultNavButton = self.chromeView.vaultNavButton;
    self.scrollView = self.chromeView.scrollView;
    self.textView = self.chromeView.textView;
    self.writingModeControl = self.chromeView.writingModeControl;
    self.notesGridStack = self.chromeView.notesGridStack;
    self.noteSearchField = self.chromeView.noteSearchField;
    self.notesSummaryLabel = self.chromeView.notesSummaryLabel;
    self.createButton = self.chromeView.createButton;
    self.vaultButton = self.chromeView.vaultButton;
    self.openButton = self.chromeView.openButton;
    self.saveButton = self.chromeView.saveButton;
    self.deleteNoteButton = self.chromeView.deleteNoteButton;
    self.vaultPathLabel = self.chromeView.vaultPathLabel;
    self.vaultSummaryLabel = self.chromeView.vaultSummaryLabel;
    self.vaultSelectButton = self.chromeView.vaultSelectButton;
    self.vaultSaveButton = self.chromeView.vaultSaveButton;
    self.settingsBackButton = self.chromeView.settingsBackButton;
    self.contentContainer = self.chromeView.contentContainer;
    self.editorPane = self.chromeView.editorPane;

    self.currentPageIndex = MarkdownEditorPageLibrary;
    self.previousContentPageIndex = MarkdownEditorPageLibrary;
    self.editorFullPageMode = [[NSUserDefaults standardUserDefaults] boolForKey:MarkdownEditorFullPageWritingModeKey];

    [self.createButton setTarget:self];
    [self.createButton setAction:@selector(newDocument)];
    [self.vaultButton setTarget:self];
    [self.vaultButton setAction:@selector(showVaultPage)];
    [self.openButton setTarget:self];
    [self.openButton setAction:@selector(presentOpenPanel)];
    [self.saveButton setTarget:self];
    [self.saveButton setAction:@selector(saveCurrentDocument)];
    [self.deleteNoteButton setTarget:self];
    [self.deleteNoteButton setAction:@selector(deleteSelectedNote)];
    [self.captureNavButton setTarget:self];
    [self.captureNavButton setAction:@selector(showCapturePage)];
    [self.libraryNavButton setTarget:self];
    [self.libraryNavButton setAction:@selector(showLibraryPage)];
    [self.vaultNavButton setTarget:self];
    [self.vaultNavButton setAction:@selector(showVaultPage)];
    [self.vaultSelectButton setTarget:self];
    [self.vaultSelectButton setAction:@selector(selectVaultFolder)];
    [self.vaultSaveButton setTarget:self];
    [self.vaultSaveButton setAction:@selector(saveCurrentDocument)];
    [self.settingsBackButton setTarget:self];
    [self.settingsBackButton setAction:@selector(returnFromSettings)];
    [self.writingModeControl setTarget:self];
    [self.writingModeControl setAction:@selector(writingModeChanged:)];
    [self.noteSearchField setTarget:self];
    [self.noteSearchField setAction:@selector(noteSearchChanged:)];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(textDidChange:)
                                                 name:NSTextDidChangeNotification
                                               object:self.textView];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(textViewDidChangeSelection:)
                                                 name:NSTextViewDidChangeSelectionNotification
                                               object:self.textView];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(noteSearchTextDidChange:)
                                                 name:NSControlTextDidChangeNotification
                                               object:self.noteSearchField];
    [self setupBlinkoWebUI];
}

- (void)setupBlinkoWebUI {
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    [configuration.userContentController addScriptMessageHandler:self name:@"elephant"];

    self.webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    self.webView.navigationDelegate = self;
    self.webView.translatesAutoresizingMaskIntoConstraints = NO;
    self.webView.allowsBackForwardNavigationGestures = NO;
    self.webView.wantsLayer = YES;
    self.webView.layer.backgroundColor = [NSColor.windowBackgroundColor CGColor];
    [self.view addSubview:self.webView];

    [NSLayoutConstraint activateConstraints:@[
        [self.webView.topAnchor constraintEqualToAnchor:self.view.topAnchor],
        [self.webView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [self.webView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [self.webView.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
    ]];

    NSURL *shellURL = [[NSBundle mainBundle] URLForResource:@"index" withExtension:@"html" subdirectory:@"BlinkoShell"];
    if (shellURL != nil) {
        [self.webView loadFileURL:shellURL allowingReadAccessToURL:shellURL.URLByDeletingLastPathComponent];
    } else {
        NSLog(@"Blinko shell resource not found");
    }
}

- (NSArray<NSDictionary *> *)webNotesPayload {
    NSMutableArray<NSDictionary *> *payload = [NSMutableArray array];
    NSArray<NSNumber *> *filteredIndexes = [self filteredNoteIndexes];
    for (NSNumber *noteIndexNumber in filteredIndexes) {
        NSInteger noteIndex = noteIndexNumber.integerValue;
        if (noteIndex < 0 || noteIndex >= (NSInteger)self.notes.count) {
            continue;
        }
        NSDictionary *note = self.notes[(NSUInteger)noteIndex];
        NSString *content = note[@"content"] ?: @"";
        NSDictionary *item = @{
            @"index": @(noteIndex),
            @"id": [note[@"id"] isKindOfClass:[NSString class]] ? note[@"id"] : @"",
            @"title": [self titleForNoteContent:content] ?: @"",
            @"preview": [self previewForNoteContent:content] ?: @"",
            @"content": content,
            @"date": [self formattedDateForNote:note] ?: @"",
            @"words": @([self wordCountForNoteContent:content]),
            @"selected": @(noteIndex == self.selectedNoteIndex),
        };
        [payload addObject:item];
    }
    return payload;
}

- (NSDictionary *)webStatePayload {
    NSString *query = self.noteSearchField.stringValue ?: @"";
    NSString *selectedContent = @"";
    if (self.selectedNoteIndex >= 0 && self.selectedNoteIndex < (NSInteger)self.notes.count) {
        selectedContent = self.notes[(NSUInteger)self.selectedNoteIndex][@"content"] ?: @"";
    }
    return @{
        @"appName": @"Elephant",
        @"page": @(self.currentPageIndex),
        @"search": query,
        @"selectedIndex": @(self.selectedNoteIndex),
        @"selectedContent": selectedContent,
        @"notes": [self webNotesPayload],
        @"noteCount": @(self.notes.count),
        @"dirty": @(self.documentController.document.dirty),
        @"vaultPath": self.vaultPath ?: @"",
    };
}

- (void)sendWebState {
    if (!self.webUIReady || self.webView == nil || self.notes == nil) {
        return;
    }
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:[self webStatePayload] options:0 error:&error];
    if (data == nil || error != nil) {
        NSLog(@"Failed to serialize web state: %@", error.localizedDescription);
        return;
    }
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    NSString *script = [NSString stringWithFormat:@"window.ElephantBridge && window.ElephantBridge.receiveState(%@);", json];
    [self.webView evaluateJavaScript:script completionHandler:nil];
}

- (void)loadNoteForWebAtIndex:(NSInteger)index {
    if (index < 0 || index >= (NSInteger)self.notes.count) {
        return;
    }
    [self syncSelectedNoteFromEditor];
    self.selectedNoteIndex = index;
    NSString *content = self.notes[(NSUInteger)index][@"content"] ?: @"";

    self.suppressChangeTracking = YES;
    [self.documentController.document replaceContent:content filePath:nil dirty:NO];
    [self.textView setString:content];
    if ([self.textView respondsToSelector:@selector(setMarkdownSource:)]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        [self.textView performSelector:@selector(setMarkdownSource:) withObject:content];
#pragma clang diagnostic pop
    }
    [self.documentController updateLineContents];
    self.suppressChangeTracking = NO;
    [self renderNotesList];
    [self refreshUIState];
}

- (void)updateSelectedNoteFromWebContent:(NSString *)content save:(BOOL)save {
    if (self.selectedNoteIndex < 0 || self.selectedNoteIndex >= (NSInteger)self.notes.count) {
        [self createNewNoteAndFocus:NO];
    }
    NSMutableDictionary *note = self.notes[(NSUInteger)self.selectedNoteIndex];
    note[@"content"] = content ?: @"";
    note[@"updatedAt"] = [NSDate date];
    self.suppressChangeTracking = YES;
    [self.documentController.document replaceContent:content ?: @"" filePath:nil dirty:!save];
    [self.textView setString:content ?: @""];
    if ([self.textView respondsToSelector:@selector(setMarkdownSource:)]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        [self.textView performSelector:@selector(setMarkdownSource:) withObject:content ?: @""];
#pragma clang diagnostic pop
    }
    [self.documentController updateLineContents];
    self.suppressChangeTracking = NO;
    [self invalidateNoteSearchIndex];
    if (save) {
        [self saveNotesToStorage];
        [self.documentController.document markSaved];
    } else {
        [self markDocumentDirty:YES];
    }
    [self renderNotesList];
    [self refreshUIState];
}

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    (void)userContentController;
    if (![message.name isEqualToString:@"elephant"] || ![message.body isKindOfClass:[NSDictionary class]]) {
        return;
    }
    NSDictionary *body = (NSDictionary *)message.body;
    NSString *action = [body[@"action"] isKindOfClass:[NSString class]] ? body[@"action"] : @"";

    if ([action isEqualToString:@"ready"]) {
        self.webUIReady = YES;
        [self sendWebState];
    } else if ([action isEqualToString:@"new"]) {
        [self createNewNoteAndFocus:NO];
        [self sendWebState];
    } else if ([action isEqualToString:@"select"]) {
        [self loadNoteForWebAtIndex:[body[@"index"] integerValue]];
    } else if ([action isEqualToString:@"search"]) {
        self.noteSearchField.stringValue = [body[@"query"] isKindOfClass:[NSString class]] ? body[@"query"] : @"";
        [self renderNotesList];
        [self sendWebState];
    } else if ([action isEqualToString:@"saveContent"]) {
        [self updateSelectedNoteFromWebContent:([body[@"content"] isKindOfClass:[NSString class]] ? body[@"content"] : @"") save:YES];
    } else if ([action isEqualToString:@"draftContent"]) {
        [self updateSelectedNoteFromWebContent:([body[@"content"] isKindOfClass:[NSString class]] ? body[@"content"] : @"") save:NO];
    } else if ([action isEqualToString:@"delete"]) {
        [self deleteSelectedNote];
        [self sendWebState];
    } else if ([action isEqualToString:@"vault"]) {
        [self selectVaultFolder];
        [self sendWebState];
    }
}

- (void)markDocumentDirty:(BOOL)dirty {
    self.documentController.document.dirty = dirty;
    [self refreshUIState];
}

- (NSString *)displayNameForCurrentDocument {
    return [self.documentController.document displayName];
}

- (BOOL)hasUnsavedChanges {
    return self.documentController.document.dirty;
}

- (void)showPage:(NSInteger)pageIndex {
    self.currentPageIndex = pageIndex;
    [self.chromeView applySelectedPageIndex:pageIndex];
    [self refreshUIState];
}

- (void)showCapturePage {
    [self showPage:MarkdownEditorPageCapture];
}

- (void)showLibraryPage {
    [self showPage:MarkdownEditorPageLibrary];
}

- (void)showVaultPage {
    if (self.currentPageIndex != MarkdownEditorPageVault) {
        self.previousContentPageIndex = self.currentPageIndex;
    }
    [self showPage:MarkdownEditorPageVault];
}

- (void)showSettingsPage {
    [self showVaultPage];
}

- (void)returnFromSettings {
    NSInteger pageIndex = self.previousContentPageIndex;
    if (pageIndex == MarkdownEditorPageVault) {
        pageIndex = MarkdownEditorPageLibrary;
    }
    [self showPage:pageIndex];
}

- (void)refreshUIState {
    NSString *documentName = [self displayNameForCurrentDocument];
    NSString *syncInfo = self.documentController.document.dirty ? @"Editing" : @"Saved";
    self.titleLabel.stringValue = @"Elephant";
    self.statusLabel.stringValue = syncInfo;
    self.statusIndicator.layer.backgroundColor = self.documentController.document.dirty
        ? [NSColor.systemBlueColor CGColor]
        : [NSColor.systemGreenColor CGColor];
    self.deleteNoteButton.enabled = self.notes.count > 1;
    self.vaultPathLabel.stringValue = self.vaultPath.length > 0 ? self.vaultPath : @"Aucun dossier selectionne";
    self.vaultSummaryLabel.stringValue = self.vaultPath.length > 0
        ? [NSString stringWithFormat:@"%lu note(s) disponibles dans %@", (unsigned long)self.notes.count, self.vaultPath.lastPathComponent]
        : @"Les notes restent locales tant qu'aucun dossier n'est choisi.";
    [self.chromeView applySelectedPageIndex:self.currentPageIndex];
    [self.chromeView applyFullPageWritingMode:self.editorFullPageMode];

    if (self.view.window) {
        NSString *windowTitle = [NSString stringWithFormat:@"Elephant - %@", documentName];
        if (self.documentController.document.dirty) {
            windowTitle = [windowTitle stringByAppendingString:@" •"];
        }
        self.view.window.title = windowTitle;
    }
    [self sendWebState];
}

- (void)writingModeChanged:(NSSegmentedControl *)sender {
    BOOL fullPage = sender.selectedSegment == 1;
    [self setEditorFullPageModeEnabled:fullPage];
}

- (void)setEditorFullPageModeEnabled:(BOOL)enabled {
    self.editorFullPageMode = enabled;
    [[NSUserDefaults standardUserDefaults] setBool:enabled forKey:MarkdownEditorFullPageWritingModeKey];
    [self.chromeView applyFullPageWritingMode:enabled];
    [self refreshUIState];
    [self.textView.window makeFirstResponder:self.textView];
}

- (BOOL)confirmDiscardUnsavedChanges {
    if (!self.documentController.document.dirty) {
        return YES;
    }
    return [self.documentController confirmDiscardUnsavedChanges];
}

- (void)newDocument {
    [self showCapturePage];
    [self createNewNoteAndFocus:YES];
}

- (void)createNewNoteAndFocus:(BOOL)focusEditor {
    NSMutableDictionary *note = [@{
        @"id": [self newJoplinItemIdentifier],
        @"content": @"",
        @"createdAt": [NSDate date],
        @"updatedAt": [NSDate date],
    } mutableCopy];
    [self.notes insertObject:note atIndex:0];
    self.selectedNoteIndex = 0;
    [self invalidateNoteSearchIndex];
    self.suppressChangeTracking = YES;
    [self.documentController.document replaceContent:@"" filePath:nil dirty:NO];
    [self.textView setString:@""];
    if ([self.textView respondsToSelector:@selector(setMarkdownSource:)]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        [self.textView performSelector:@selector(setMarkdownSource:) withObject:@""];
#pragma clang diagnostic pop
    }
    [self.documentController updateLineContents];
    self.suppressChangeTracking = NO;
    [self renderNotesList];
    [self saveNotesToStorage];
    [self refreshUIState];
    if (focusEditor) {
        [self showCapturePage];
        [self.textView.window makeFirstResponder:self.textView];
    }
}

- (BOOL)saveCurrentDocument {
    [self syncSelectedNoteFromEditor];
    [self saveNotesToStorage];
    [self renderNotesList];
    [self refreshUIState];
    if (self.vaultPath.length > 0) {
        return YES;
    }
    return [self.documentController saveCurrentDocument];
}

- (void)saveDocumentAs {
    [self.documentController saveDocumentAs];
}

- (void)presentOpenPanel {
    if (![self confirmDiscardUnsavedChanges]) {
        return;
    }

    self.suppressChangeTracking = YES;
    [self.documentController presentOpenPanel];
    self.suppressChangeTracking = NO;
}

#pragma mark - Default Content

- (void)loadDefaultContent {
    NSString *defaultContent = @"# Titre\n\nÉcrivez votre markdown ici...\n\nExemple:\n- **Gras**\n- *Italique*\n- ==Surligné==\n- ++Souligné++";

    if (![self loadNotesFromVault]) {
        [self loadNotesFromUserDefaultsWithFallbackContent:defaultContent];
    }
    self.selectedNoteIndex = 0;
    NSString *selectedContent = self.notes.firstObject[@"content"] ?: defaultContent;

    self.suppressChangeTracking = YES;
    [self.textView setString:selectedContent];
    if ([self.textView respondsToSelector:@selector(setMarkdownSource:)]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        [self.textView performSelector:@selector(setMarkdownSource:) withObject:selectedContent];
#pragma clang diagnostic pop
    }
    self.suppressChangeTracking = NO;
    [self.documentController.document replaceContent:selectedContent filePath:nil dirty:NO];
    [self.documentController updateLineContents];
    [self refreshUIState];
    [self.textView setSelectedRange:NSMakeRange(0, 0)];
    if ([self.textView respondsToSelector:@selector(forceRender)]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.textView performSelector:@selector(forceRender)];
        });
#pragma clang diagnostic pop
    }
    [self renderNotesList];
}

#pragma mark - Notes Library

- (void)initializeVaultPath {
    NSString *storedPath = [[NSUserDefaults standardUserDefaults] stringForKey:MarkdownEditorVaultPathKey];
    BOOL isDirectory = NO;
    if (storedPath.length > 0 && [[NSFileManager defaultManager] fileExistsAtPath:storedPath isDirectory:&isDirectory] && isDirectory) {
        self.vaultPath = storedPath;
    } else {
        self.vaultPath = nil;
    }
}

- (void)syncSelectedNoteFromEditor {
    if (self.selectedNoteIndex < 0 || self.selectedNoteIndex >= (NSInteger)self.notes.count) {
        return;
    }
    NSMutableDictionary *note = self.notes[(NSUInteger)self.selectedNoteIndex];
    if (![note[@"id"] isKindOfClass:[NSString class]] || [note[@"id"] length] == 0) {
        note[@"id"] = [self newJoplinItemIdentifier];
    }
    note[@"content"] = self.textView.string ?: @"";
    note[@"updatedAt"] = [NSDate date];
    [self invalidateNoteSearchIndex];
}

- (NSArray<NSNumber *> *)filteredNoteIndexes {
    NSString *query = [self.noteSearchField.stringValue stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    NSMutableArray<NSNumber *> *indexes = [NSMutableArray array];

    if (query.length == 0) {
        for (NSUInteger index = 0; index < self.notes.count; index++) {
            [indexes addObject:@(index)];
        }
        return indexes;
    }

    if (![self ensureNoteSearchIndex]) {
        for (NSUInteger index = 0; index < self.notes.count; index++) {
            NSString *content = self.notes[index][@"content"] ?: @"";
            if ([content rangeOfString:query options:NSCaseInsensitiveSearch].location != NSNotFound) {
                [indexes addObject:@(index)];
            }
        }
        return indexes;
    }

    NoteEmbeddingResult *results = calloc(self.notes.count, sizeof(NoteEmbeddingResult));
    if (!results) {
        return indexes;
    }

    size_t resultCount = nes_search(self.noteSearchIndex, query.UTF8String, 0.035f, results, self.notes.count);
    for (size_t resultIndex = 0; resultIndex < resultCount; resultIndex++) {
        [indexes addObject:@(results[resultIndex].note_index)];
    }
    free(results);

    return indexes;
}

- (void)invalidateNoteSearchIndex {
    self.noteSearchIndexDirty = YES;
}

- (BOOL)ensureNoteSearchIndex {
    if (!self.noteSearchIndex) {
        self.noteSearchIndex = nes_create(NES_DEFAULT_DIMENSIONS);
        self.noteSearchIndexDirty = YES;
    }
    if (!self.noteSearchIndex) {
        return NO;
    }
    if (!self.noteSearchIndexDirty && nes_count(self.noteSearchIndex) == self.notes.count) {
        return YES;
    }

    size_t noteCount = self.notes.count;
    const char **noteIds = noteCount > 0 ? calloc(noteCount, sizeof(char *)) : NULL;
    const char **contents = noteCount > 0 ? calloc(noteCount, sizeof(char *)) : NULL;
    if (noteCount > 0 && (!noteIds || !contents)) {
        free(noteIds);
        free(contents);
        return NO;
    }

    for (NSUInteger index = 0; index < self.notes.count; index++) {
        NSDictionary *note = self.notes[index];
        NSString *noteId = [note[@"id"] isKindOfClass:[NSString class]] ? note[@"id"] : @"";
        NSString *content = [note[@"content"] isKindOfClass:[NSString class]] ? note[@"content"] : @"";
        noteIds[index] = noteId.UTF8String;
        contents[index] = content.UTF8String;
    }

    BOOL rebuilt = nes_rebuild(self.noteSearchIndex, noteIds, contents, noteCount);
    if (!rebuilt) {
        NSLog(@"Embedding search index rebuild failed: %s", nes_last_error(self.noteSearchIndex));
    }
    self.noteSearchIndexDirty = !rebuilt;
    free(noteIds);
    free(contents);
    return rebuilt;
}

- (BOOL)loadNotesFromVault {
    if (self.vaultPath.length == 0) {
        return NO;
    }

    NSFileManager *fileManager = [NSFileManager defaultManager];
    BOOL isDirectory = NO;
    if (![fileManager fileExistsAtPath:self.vaultPath isDirectory:&isDirectory] || !isDirectory) {
        self.vaultPath = nil;
        [[NSUserDefaults standardUserDefaults] removeObjectForKey:MarkdownEditorVaultPathKey];
        return NO;
    }
    [self ensureJoplinVaultStructure];

    NSError *error = nil;
    NSArray<NSURL *> *fileURLs = [fileManager contentsOfDirectoryAtURL:[NSURL fileURLWithPath:self.vaultPath]
                                             includingPropertiesForKeys:@[NSURLContentModificationDateKey, NSURLCreationDateKey]
                                                                options:NSDirectoryEnumerationSkipsHiddenFiles
                                                                  error:&error];
    if (error) {
        NSLog(@"Failed to read vault: %@", error.localizedDescription);
        return NO;
    }

    NSPredicate *markdownPredicate = [NSPredicate predicateWithBlock:^BOOL(NSURL *url, NSDictionary *bindings) {
        (void)bindings;
        NSString *extension = url.pathExtension.lowercaseString;
        if ([url.lastPathComponent isEqualToString:@"info.json"]) {
            return NO;
        }
        return [extension isEqualToString:@"md"] || [extension isEqualToString:@"markdown"];
    }];
    NSArray<NSURL *> *markdownURLs = [[fileURLs filteredArrayUsingPredicate:markdownPredicate] sortedArrayUsingComparator:^NSComparisonResult(NSURL *firstURL, NSURL *secondURL) {
        NSDate *firstDate = nil;
        NSDate *secondDate = nil;
        [firstURL getResourceValue:&firstDate forKey:NSURLContentModificationDateKey error:nil];
        [secondURL getResourceValue:&secondDate forKey:NSURLContentModificationDateKey error:nil];
        return [secondDate compare:firstDate];
    }];

    if (markdownURLs.count == 0) {
        return NO;
    }

    self.notes = [NSMutableArray arrayWithCapacity:markdownURLs.count];
    for (NSURL *url in markdownURLs) {
        NSString *fileContent = [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:nil] ?: @"";
        NSDictionary *parsedItem = [self parseJoplinItemFileContent:fileContent];
        NSDictionary *metadata = parsedItem[@"metadata"];
        NSString *type = metadata[@"type_"];
        if (type.length > 0 && ![type isEqualToString:@"1"]) {
            continue;
        }
        NSString *content = parsedItem[@"body"] ?: fileContent;
        NSDate *createdAt = nil;
        NSDate *updatedAt = nil;
        [url getResourceValue:&createdAt forKey:NSURLCreationDateKey error:nil];
        [url getResourceValue:&updatedAt forKey:NSURLContentModificationDateKey error:nil];
        createdAt = [self dateFromJoplinString:metadata[@"created_time"] fallback:createdAt];
        updatedAt = [self dateFromJoplinString:metadata[@"updated_time"] fallback:updatedAt];
        NSString *identifier = metadata[@"id"];
        if (identifier.length == 0) {
            identifier = url.URLByDeletingPathExtension.lastPathComponent ?: [self newJoplinItemIdentifier];
        }
        [self.notes addObject:[@{
            @"id": identifier,
            @"content": content,
            @"createdAt": createdAt ?: [NSDate date],
            @"updatedAt": updatedAt ?: [NSDate date],
            @"filePath": url.path,
        } mutableCopy]];
    }

    [self invalidateNoteSearchIndex];
    return self.notes.count > 0;
}

- (NSString *)newJoplinItemIdentifier {
    NSString *uuid = [[NSUUID UUID].UUIDString stringByReplacingOccurrencesOfString:@"-" withString:@""];
    return uuid.lowercaseString;
}

- (NSDateFormatter *)joplinDateFormatter {
    static NSDateFormatter *formatter = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        formatter = [[NSDateFormatter alloc] init];
        formatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
        formatter.timeZone = [NSTimeZone timeZoneForSecondsFromGMT:0];
        formatter.dateFormat = @"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'";
    });
    return formatter;
}

- (NSDate *)dateFromJoplinString:(NSString *)dateString fallback:(NSDate *)fallbackDate {
    if (![dateString isKindOfClass:[NSString class]] || dateString.length == 0) {
        return fallbackDate ?: [NSDate date];
    }
    NSDate *date = [[self joplinDateFormatter] dateFromString:dateString];
    return date ?: fallbackDate ?: [NSDate date];
}

- (BOOL)ensureJoplinVaultStructure {
    if (self.vaultPath.length == 0) {
        return NO;
    }

    NSFileManager *fileManager = [NSFileManager defaultManager];
    BOOL isDirectory = NO;
    if (![fileManager fileExistsAtPath:self.vaultPath isDirectory:&isDirectory] || !isDirectory) {
        return NO;
    }

    NSArray<NSString *> *directories = @[@".resource", @".sync", @"locks", @"temp"];
    for (NSString *directoryName in directories) {
        NSString *directoryPath = [self.vaultPath stringByAppendingPathComponent:directoryName];
        [fileManager createDirectoryAtPath:directoryPath withIntermediateDirectories:YES attributes:nil error:nil];
    }

    NSString *infoPath = [self.vaultPath stringByAppendingPathComponent:@"info.json"];
    if (![fileManager fileExistsAtPath:infoPath]) {
        NSTimeInterval now = [[NSDate date] timeIntervalSince1970] * 1000.0;
        NSDictionary *info = @{
            @"version": @3,
            @"e2ee": @{@"value": @NO, @"updatedTime": @(now)},
            @"activeMasterKeyId": @{@"value": @"", @"updatedTime": @(now)},
            @"masterKeys": @[],
            @"ppk": @{@"value": [NSNull null], @"updatedTime": @(now)},
            @"appMinVersion": @"0.0.0",
        };
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:info options:NSJSONWritingPrettyPrinted error:nil];
        [jsonData writeToFile:infoPath atomically:YES];
    }

    return YES;
}

- (NSDictionary *)parseJoplinItemFileContent:(NSString *)fileContent {
    NSArray<NSString *> *lines = [fileContent componentsSeparatedByString:@"\n"];
    NSSet<NSString *> *knownKeys = [NSSet setWithArray:@[
        @"id", @"parent_id", @"title", @"created_time", @"updated_time", @"is_conflict",
        @"latitude", @"longitude", @"altitude", @"author", @"source_url", @"is_todo",
        @"todo_due", @"todo_completed", @"source", @"source_application", @"application_data",
        @"order", @"user_created_time", @"user_updated_time", @"encryption_cipher_text",
        @"encryption_applied", @"markup_language", @"is_shared", @"type_"
    ]];
    NSMutableDictionary *metadata = [NSMutableDictionary dictionary];
    NSInteger metadataStart = (NSInteger)lines.count;

    for (NSInteger index = (NSInteger)lines.count - 1; index >= 0; index--) {
        NSString *line = lines[(NSUInteger)index];
        if (line.length == 0) {
            metadataStart = index;
            continue;
        }
        NSRange separatorRange = [line rangeOfString:@":"];
        if (separatorRange.location == NSNotFound) {
            break;
        }
        NSString *key = [[line substringToIndex:separatorRange.location] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if (![knownKeys containsObject:key]) {
            break;
        }
        NSString *value = [[line substringFromIndex:separatorRange.location + 1] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        metadata[key] = value;
        metadataStart = index;
    }

    NSString *body = @"";
    if (metadataStart > 0) {
        NSArray<NSString *> *bodyLines = [lines subarrayWithRange:NSMakeRange(0, (NSUInteger)metadataStart)];
        body = [bodyLines componentsJoinedByString:@"\n"];
        body = [body stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    } else if (metadata.count == 0) {
        body = fileContent ?: @"";
    }

    return @{@"body": body ?: @"", @"metadata": metadata};
}

- (NSString *)joplinItemContentForNote:(NSDictionary *)note {
    NSString *identifier = note[@"id"] ?: [self newJoplinItemIdentifier];
    NSString *body = note[@"content"] ?: @"";
    NSString *title = [self titleForNoteContent:body];
    NSDate *createdAt = note[@"createdAt"] ?: [NSDate date];
    NSDate *updatedAt = note[@"updatedAt"] ?: [NSDate date];
    NSDateFormatter *formatter = [self joplinDateFormatter];

    return [NSString stringWithFormat:@"%@\n\nid: %@\nparent_id: \ntitle: %@\ncreated_time: %@\nupdated_time: %@\nis_conflict: 0\nlatitude: 0.00000000\nlongitude: 0.00000000\naltitude: 0.0000\nauthor: \nsource_url: \nis_todo: 0\ntodo_due: 0\ntodo_completed: 0\nsource: c-editor\nsource_application: com.ceditor.Elephant\napplication_data: \norder: %.0f\nuser_created_time: %@\nuser_updated_time: %@\nencryption_cipher_text: \nencryption_applied: 0\nmarkup_language: 1\nis_shared: 0\ntype_: 1\n",
            body,
            identifier,
            title,
            [formatter stringFromDate:createdAt],
            [formatter stringFromDate:updatedAt],
            [createdAt timeIntervalSince1970] * 1000.0,
            [formatter stringFromDate:createdAt],
            [formatter stringFromDate:updatedAt]];
}

- (BOOL)saveNoteToVault:(NSMutableDictionary *)note {
    if (self.vaultPath.length == 0) {
        return NO;
    }

    NSFileManager *fileManager = [NSFileManager defaultManager];
    BOOL isDirectory = NO;
    if (![fileManager fileExistsAtPath:self.vaultPath isDirectory:&isDirectory] || !isDirectory) {
        return NO;
    }
    [self ensureJoplinVaultStructure];

    if (![note[@"id"] isKindOfClass:[NSString class]] || [note[@"id"] length] == 0) {
        note[@"id"] = [self newJoplinItemIdentifier];
    }

    NSString *desiredFilePath = [self.vaultPath stringByAppendingPathComponent:[NSString stringWithFormat:@"%@.md", note[@"id"]]];
    NSString *filePath = note[@"filePath"];
    if (![filePath isKindOfClass:[NSString class]] || filePath.length == 0 || ![filePath isEqualToString:desiredFilePath]) {
        if ([filePath isKindOfClass:[NSString class]] && filePath.length > 0 && [filePath hasPrefix:self.vaultPath]) {
            [[NSFileManager defaultManager] removeItemAtPath:filePath error:nil];
        }
        filePath = desiredFilePath;
        note[@"filePath"] = desiredFilePath;
    }

    NSError *error = nil;
    NSString *itemContent = [self joplinItemContentForNote:note];
    BOOL ok = [itemContent writeToFile:filePath atomically:YES encoding:NSUTF8StringEncoding error:&error];
    if (!ok || error) {
        NSLog(@"Failed to save note to vault: %@", error.localizedDescription);
        return NO;
    }
    note[@"updatedAt"] = [NSDate date];
    return YES;
}

- (BOOL)saveAllNotesToVault {
    if (self.vaultPath.length == 0) {
        return NO;
    }
    BOOL allSaved = YES;
    for (NSMutableDictionary *note in self.notes) {
        allSaved = [self saveNoteToVault:note] && allSaved;
    }
    return allSaved;
}

- (void)loadNotesFromUserDefaultsWithFallbackContent:(NSString *)defaultContent {
    NSArray *storedNotes = [[NSUserDefaults standardUserDefaults] arrayForKey:MarkdownEditorStoredNotesKey];
    self.notes = [NSMutableArray array];

    for (NSDictionary *storedNote in storedNotes) {
        if (![storedNote isKindOfClass:[NSDictionary class]]) {
            continue;
        }
        NSString *content = [storedNote[@"content"] isKindOfClass:[NSString class]] ? storedNote[@"content"] : @"";
        NSString *identifier = [storedNote[@"id"] isKindOfClass:[NSString class]] ? storedNote[@"id"] : [self newJoplinItemIdentifier];
        NSString *filePath = [storedNote[@"filePath"] isKindOfClass:[NSString class]] ? storedNote[@"filePath"] : @"";
        NSDate *createdAt = [storedNote[@"createdAt"] isKindOfClass:[NSDate class]] ? storedNote[@"createdAt"] : [NSDate date];
        NSDate *updatedAt = [storedNote[@"updatedAt"] isKindOfClass:[NSDate class]] ? storedNote[@"updatedAt"] : createdAt;
        NSMutableDictionary *note = [@{@"id": identifier, @"content": content, @"createdAt": createdAt, @"updatedAt": updatedAt} mutableCopy];
        if (filePath.length > 0) {
            note[@"filePath"] = filePath;
        }
        [self.notes addObject:note];
    }

    if (self.notes.count == 0) {
        [self.notes addObjectsFromArray:@[
            [@{@"id": [self newJoplinItemIdentifier], @"content": defaultContent, @"createdAt": [NSDate date], @"updatedAt": [NSDate date]} mutableCopy],
            [@{@"id": [self newJoplinItemIdentifier], @"content": @"## Idée rapide\n\nCliquez sur une carte pour la modifier.", @"createdAt": [NSDate dateWithTimeIntervalSinceNow:-7200], @"updatedAt": [NSDate dateWithTimeIntervalSinceNow:-7200]} mutableCopy],
            [@{@"id": [self newJoplinItemIdentifier], @"content": @"Liens à tester\n\nhttps://docmost.com/\nhttps://affine.pro/", @"createdAt": [NSDate dateWithTimeIntervalSinceNow:-86400], @"updatedAt": [NSDate dateWithTimeIntervalSinceNow:-86400]} mutableCopy],
        ]];
        [self saveNotesToStorage];
    }
    [self invalidateNoteSearchIndex];
}

- (void)saveNotesToUserDefaults {
    NSMutableArray *storedNotes = [NSMutableArray arrayWithCapacity:self.notes.count];
    for (NSDictionary *note in self.notes) {
        NSMutableDictionary *storedNote = [@{
            @"id": note[@"id"] ?: [self newJoplinItemIdentifier],
            @"content": note[@"content"] ?: @"",
            @"createdAt": note[@"createdAt"] ?: [NSDate date],
            @"updatedAt": note[@"updatedAt"] ?: [NSDate date],
        } mutableCopy];
        if ([note[@"filePath"] isKindOfClass:[NSString class]]) {
            storedNote[@"filePath"] = note[@"filePath"];
        }
        [storedNotes addObject:storedNote];
    }
    [[NSUserDefaults standardUserDefaults] setObject:storedNotes forKey:MarkdownEditorStoredNotesKey];
}

- (void)saveNotesToStorage {
    [self saveNotesToUserDefaults];
    if ([self saveAllNotesToVault]) {
        self.documentController.document.dirty = NO;
    }
}

- (NSString *)titleForNoteContent:(NSString *)content {
    NSArray<NSString *> *lines = [content componentsSeparatedByString:@"\n"];
    for (NSString *line in lines) {
        NSString *trimmed = [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if (trimmed.length > 0) {
            while ([trimmed hasPrefix:@"#"] || [trimmed hasPrefix:@"-"]) {
                trimmed = [[trimmed substringFromIndex:1] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
            }
            return trimmed.length > 0 ? trimmed : @"Nouvelle note";
        }
    }
    return @"Nouvelle note";
}

- (NSString *)previewForNoteContent:(NSString *)content {
    NSString *normalized = [[content ?: @"" componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]] componentsJoinedByString:@" "];
    normalized = [normalized stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (normalized.length == 0) {
        return @"Commencez à écrire dans l'éditeur.";
    }
    if (normalized.length > 210) {
        return [[normalized substringToIndex:210] stringByAppendingString:@"..."];
    }
    return normalized;
}

- (NSUInteger)wordCountForNoteContent:(NSString *)content {
    NSString *normalized = [content ?: @"" stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (normalized.length == 0) {
        return 0;
    }
    NSArray<NSString *> *parts = [normalized componentsSeparatedByCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    NSUInteger count = 0;
    for (NSString *part in parts) {
        if (part.length > 0) {
            count += 1;
        }
    }
    return count;
}

- (NSString *)formattedDateForNote:(NSDictionary *)note {
    static NSDateFormatter *formatter = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        formatter = [[NSDateFormatter alloc] init];
        formatter.locale = [NSLocale localeWithLocaleIdentifier:@"fr_FR"];
        formatter.dateFormat = @"d MMM yyyy • HH:mm";
    });
    return [formatter stringFromDate:note[@"updatedAt"] ?: [NSDate date]];
}

- (NSButton *)cardButtonForNoteAtIndex:(NSInteger)index {
    NSDictionary *note = self.notes[(NSUInteger)index];
    NSString *content = note[@"content"] ?: @"";
    NSString *date = [self formattedDateForNote:note];
    NSString *title = [self titleForNoteContent:content];
    NSString *preview = [self previewForNoteContent:content];
    NSString *meta = [NSString stringWithFormat:@"%lu mots • Markdown", (unsigned long)[self wordCountForNoteContent:content]];
    NSString *cardText = [NSString stringWithFormat:@"\n%@\n\n%@\n%@\n\n%@", title, preview, date, meta];

    NSMutableAttributedString *attributed = [[NSMutableAttributedString alloc] initWithString:cardText];
    NSRange fullRange = NSMakeRange(0, attributed.length);
    [attributed addAttribute:NSForegroundColorAttributeName value:NSColor.secondaryLabelColor range:fullRange];
    [attributed addAttribute:NSFontAttributeName value:[NSFont systemFontOfSize:12 weight:NSFontWeightRegular] range:fullRange];
    NSRange dateRange = [cardText rangeOfString:date];
    NSRange titleRange = [cardText rangeOfString:title];
    if (dateRange.location != NSNotFound) {
        [attributed addAttribute:NSForegroundColorAttributeName value:NSColor.tertiaryLabelColor range:dateRange];
        [attributed addAttribute:NSFontAttributeName value:[NSFont systemFontOfSize:11 weight:NSFontWeightSemibold] range:dateRange];
    }
    if (titleRange.location != NSNotFound) {
        [attributed addAttribute:NSForegroundColorAttributeName value:NSColor.labelColor range:titleRange];
        [attributed addAttribute:NSFontAttributeName value:[NSFont systemFontOfSize:14 weight:NSFontWeightSemibold] range:titleRange];
    }
    NSRange footerRange = [cardText rangeOfString:meta];
    if (footerRange.location != NSNotFound) {
        [attributed addAttribute:NSForegroundColorAttributeName value:NSColor.secondaryLabelColor range:footerRange];
        [attributed addAttribute:NSFontAttributeName value:[NSFont systemFontOfSize:11 weight:NSFontWeightSemibold] range:footerRange];
    }
    NSMutableParagraphStyle *paragraphStyle = [[NSMutableParagraphStyle alloc] init];
    paragraphStyle.lineBreakMode = NSLineBreakByWordWrapping;
    paragraphStyle.lineSpacing = 4.0;
    paragraphStyle.paragraphSpacing = 2.0;
    paragraphStyle.firstLineHeadIndent = 14.0;
    paragraphStyle.headIndent = 14.0;
    paragraphStyle.tailIndent = -14.0;
    [attributed addAttribute:NSParagraphStyleAttributeName value:paragraphStyle range:fullRange];

    NSButton *button = [[NSButton alloc] init];
    button.tag = index;
    button.attributedTitle = attributed;
    button.alignment = NSTextAlignmentLeft;
    button.bezelStyle = NSBezelStyleRegularSquare;
    button.bordered = NO;
    button.wantsLayer = YES;
    button.layer.backgroundColor = index == self.selectedNoteIndex
        ? [[NSColor.systemBlueColor colorWithAlphaComponent:0.035] CGColor]
        : [NSColor.controlBackgroundColor CGColor];
    button.layer.cornerRadius = 8.0;
    button.layer.borderWidth = index == self.selectedNoteIndex ? 1.0 : 1.0;
    button.layer.borderColor = index == self.selectedNoteIndex
        ? [[NSColor.systemBlueColor colorWithAlphaComponent:0.24] CGColor]
        : [[NSColor.separatorColor colorWithAlphaComponent:0.48] CGColor];
    button.contentTintColor = NSColor.labelColor;
    button.target = self;
    button.action = @selector(selectNoteFromCard:);
    button.imagePosition = NSNoImage;
    button.translatesAutoresizingMaskIntoConstraints = NO;
    [button.heightAnchor constraintEqualToConstant:124].active = YES;
    return button;
}

- (void)renderNotesList {
    while (self.notesGridStack.arrangedSubviews.count > 0) {
        NSView *view = self.notesGridStack.arrangedSubviews.firstObject;
        [self.notesGridStack removeArrangedSubview:view];
        [view removeFromSuperview];
    }

    NSArray<NSNumber *> *filteredIndexes = [self filteredNoteIndexes];
    NSString *summary = filteredIndexes.count == self.notes.count
        ? [NSString stringWithFormat:@"%lu notes recentes", (unsigned long)self.notes.count]
        : [NSString stringWithFormat:@"%lu resultat(s) sur %lu notes", (unsigned long)filteredIndexes.count, (unsigned long)self.notes.count];
    self.notesSummaryLabel.stringValue = summary;

    if (filteredIndexes.count == 0) {
        NSTextField *emptyLabel = [[NSTextField alloc] init];
        emptyLabel.stringValue = @"Aucune note ne correspond à cette recherche.";
        emptyLabel.font = [NSFont systemFontOfSize:14 weight:NSFontWeightMedium];
        emptyLabel.textColor = NSColor.secondaryLabelColor;
        emptyLabel.backgroundColor = [NSColor clearColor];
        emptyLabel.bordered = NO;
        emptyLabel.editable = NO;
        emptyLabel.alignment = NSTextAlignmentCenter;
        emptyLabel.translatesAutoresizingMaskIntoConstraints = NO;
        [self.notesGridStack addArrangedSubview:emptyLabel];
        [emptyLabel.widthAnchor constraintEqualToAnchor:self.notesGridStack.widthAnchor].active = YES;
        [emptyLabel.heightAnchor constraintEqualToConstant:80].active = YES;
        return;
    }

    for (NSUInteger filteredIndex = 0; filteredIndex < filteredIndexes.count; filteredIndex += 2) {
        NSStackView *row = [[NSStackView alloc] init];
        row.orientation = NSUserInterfaceLayoutOrientationHorizontal;
        row.alignment = NSLayoutAttributeTop;
        row.distribution = NSStackViewDistributionFillEqually;
        row.spacing = 16.0;
        row.translatesAutoresizingMaskIntoConstraints = NO;

        NSInteger firstNoteIndex = filteredIndexes[filteredIndex].integerValue;
        [row addArrangedSubview:[self cardButtonForNoteAtIndex:firstNoteIndex]];
        if (filteredIndex + 1 < filteredIndexes.count) {
            NSInteger secondNoteIndex = filteredIndexes[filteredIndex + 1].integerValue;
            [row addArrangedSubview:[self cardButtonForNoteAtIndex:secondNoteIndex]];
        } else {
            NSView *spacer = [[NSView alloc] init];
            [row addArrangedSubview:spacer];
        }

        [self.notesGridStack addArrangedSubview:row];
        [row.widthAnchor constraintEqualToAnchor:self.notesGridStack.widthAnchor].active = YES;
    }
}

- (void)noteSearchChanged:(NSSearchField *)sender {
    (void)sender;
    [self showLibraryPage];
    [self renderNotesList];
}

- (void)noteSearchTextDidChange:(NSNotification *)notification {
    (void)notification;
    [self renderNotesList];
}

- (void)deleteSelectedNote {
    if (self.notes.count <= 1 || self.selectedNoteIndex < 0 || self.selectedNoteIndex >= (NSInteger)self.notes.count) {
        return;
    }
    NSString *deletedFilePath = self.notes[(NSUInteger)self.selectedNoteIndex][@"filePath"];
    [self.notes removeObjectAtIndex:(NSUInteger)self.selectedNoteIndex];
    [self invalidateNoteSearchIndex];
    if ([deletedFilePath isKindOfClass:[NSString class]] && deletedFilePath.length > 0) {
        [[NSFileManager defaultManager] removeItemAtPath:deletedFilePath error:nil];
    }
    self.selectedNoteIndex = MIN(self.selectedNoteIndex, (NSInteger)self.notes.count - 1);
    NSString *content = self.notes[(NSUInteger)self.selectedNoteIndex][@"content"] ?: @"";

    self.suppressChangeTracking = YES;
    [self.documentController.document replaceContent:content filePath:nil dirty:NO];
    [self.textView setString:content];
    if ([self.textView respondsToSelector:@selector(setMarkdownSource:)]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        [self.textView performSelector:@selector(setMarkdownSource:) withObject:content];
#pragma clang diagnostic pop
    }
    [self.documentController updateLineContents];
    self.suppressChangeTracking = NO;
    [self saveNotesToStorage];
    [self showCapturePage];
    [self renderNotesList];
    [self refreshUIState];
}

- (void)selectNoteFromCard:(NSButton *)sender {
    NSInteger index = sender.tag;
    if (index < 0 || index >= (NSInteger)self.notes.count) {
        return;
    }
    [self syncSelectedNoteFromEditor];
    self.selectedNoteIndex = index;
    NSString *content = self.notes[(NSUInteger)index][@"content"] ?: @"";

    self.suppressChangeTracking = YES;
    [self.documentController.document replaceContent:content filePath:nil dirty:NO];
    [self.textView setString:content];
    if ([self.textView respondsToSelector:@selector(setMarkdownSource:)]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        [self.textView performSelector:@selector(setMarkdownSource:) withObject:content];
#pragma clang diagnostic pop
    }
    [self.documentController updateLineContents];
    self.suppressChangeTracking = NO;
    [self.textView setSelectedRange:NSMakeRange(0, 0)];
    [self showCapturePage];
    [self.textView.window makeFirstResponder:self.textView];
    [self renderNotesList];
    [self refreshUIState];
}

- (void)updateLineContents {
    [self.documentController updateLineContents];
    NSLog(@"📝 Updated %lu lines of content", (unsigned long)self.documentController.document.lineContents.count);
}

#pragma mark - Notifications

- (void)textDidChange:(NSNotification *)notification {
    if (self.suppressChangeTracking) {
        return;
    }
    [self syncSelectedNoteFromEditor];
    [self updateLineContents];
    [self updateCursorLineIndex];
    [self markDocumentDirty:YES];
    [self renderNotesList];
    [self saveNotesToStorage];
}

- (void)textViewDidChangeSelection:(NSNotification *)notification {
    if (self.suppressChangeTracking) {
        return;
    }
    [self updateCursorLineIndex];
}

- (BOOL)updateCursorLineIndex {
    BOOL lineChanged = [self.documentController updateCursorLineIndex];
    if (lineChanged) {
        NSLog(@"📍 Current line: %ld", (long)self.documentController.document.currentLineIndex);
        [self refreshUIState];
    }
    return lineChanged;
}

#pragma mark - File Operations

- (void)selectVaultFolder {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.title = @"Choisir un dossier de stockage";
    panel.message = @"Sélectionnez le dossier où stocker les notes Markdown.";
    panel.canChooseFiles = NO;
    panel.canChooseDirectories = YES;
    panel.allowsMultipleSelection = NO;
    panel.canCreateDirectories = YES;

    if ([panel runModal] != NSModalResponseOK) {
        return;
    }

    [self showVaultPage];
    [self syncSelectedNoteFromEditor];
    self.vaultPath = panel.URL.path;
    [[NSUserDefaults standardUserDefaults] setObject:self.vaultPath forKey:MarkdownEditorVaultPathKey];

    if ([self loadNotesFromVault]) {
        self.selectedNoteIndex = 0;
        NSString *content = self.notes.firstObject[@"content"] ?: @"";
        self.suppressChangeTracking = YES;
        [self.documentController.document replaceContent:content filePath:nil dirty:NO];
        [self.textView setString:content];
        if ([self.textView respondsToSelector:@selector(setMarkdownSource:)]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
            [self.textView performSelector:@selector(setMarkdownSource:) withObject:content];
#pragma clang diagnostic pop
        }
        [self.documentController updateLineContents];
        self.suppressChangeTracking = NO;
    } else {
        [self saveAllNotesToVault];
    }

    [self saveNotesToStorage];
    [self renderNotesList];
    [self refreshUIState];
}

- (BOOL)openFile:(NSString *)filePath {
    self.suppressChangeTracking = YES;
    BOOL opened = [self.documentController openFile:filePath];
    self.suppressChangeTracking = NO;
    if (opened) {
        if (self.selectedNoteIndex < 0 || self.selectedNoteIndex >= (NSInteger)self.notes.count) {
            [self createNewNoteAndFocus:NO];
        }
        [self syncSelectedNoteFromEditor];
        [self showCapturePage];
        [self renderNotesList];
        [self saveNotesToStorage];
    }
    return opened;
}

#pragma mark - Cleanup

- (void)dealloc {
    NSLog(@"🧹 Cleaning up resources");
    [[NSNotificationCenter defaultCenter] removeObserver:self];
    nes_destroy(self.noteSearchIndex);
    self.noteSearchIndex = NULL;
}

@end
