#import "AppDelegate.h"
#import "Components/MarkdownEditorMenuBuilder.h"
#import "Components/MarkdownEditorWindowCoordinator.h"

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
    NSLog(@"🚀 App launching...");

    [NSApp setMainMenu:[MarkdownEditorMenuBuilder mainMenuWithTarget:self]];
    self.windowCoordinator = [[MarkdownEditorWindowCoordinator alloc] init];
    [self.windowCoordinator launch];

    NSLog(@"✅ Markdown editor window ready");
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (BOOL)application:(NSApplication *)sender openFile:(NSString *)filename {
    return [self.windowCoordinator openExternalFile:filename];
}

- (void)newDocument:(id)sender {
    [self.windowCoordinator newDocument];
}

- (void)openDocument:(id)sender {
    [self.windowCoordinator openDocument];
}

- (void)saveDocument:(id)sender {
    [self.windowCoordinator saveDocument];
}

- (void)saveDocumentAs:(id)sender {
    [self.windowCoordinator saveDocumentAs];
}

- (void)closeDocumentWindow:(id)sender {
    [self.windowCoordinator closeDocumentWindow];
}

- (void)showSettings:(id)sender {
    [self.windowCoordinator showSettings];
}

- (void)chooseStorageFolder:(id)sender {
    [self.windowCoordinator chooseStorageFolder];
}

- (void)syncStorageNow:(id)sender {
    [self.windowCoordinator saveDocument];
}

- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
    return [self.windowCoordinator applicationShouldTerminate];
}

@end
