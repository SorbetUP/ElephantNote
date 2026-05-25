#import "MarkdownDocumentIO.h"
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

@implementation MarkdownDocumentIO

- (BOOL)confirmDiscardUnsavedChanges {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Document non enregistré";
    alert.informativeText = @"Vous avez des modifications non enregistrées. Voulez-vous les abandonner ?";
    [alert addButtonWithTitle:@"Abandonner"];
    [alert addButtonWithTitle:@"Annuler"];
    alert.alertStyle = NSAlertStyleWarning;
    return [alert runModal] == NSAlertFirstButtonReturn;
}

- (NSString *)presentOpenPanel {
    NSOpenPanel *openPanel = [NSOpenPanel openPanel];
    if (@available(macOS 11.0, *)) {
        openPanel.allowedContentTypes = @[[UTType typeWithFilenameExtension:@"md"]];
    } else {
        #pragma clang diagnostic push
        #pragma clang diagnostic ignored "-Wdeprecated-declarations"
        openPanel.allowedFileTypes = @[@"md"];
        #pragma clang diagnostic pop
    }
    openPanel.allowsMultipleSelection = NO;
    openPanel.canChooseDirectories = NO;
    openPanel.canChooseFiles = YES;
    if ([openPanel runModal] == NSModalResponseOK) {
        return openPanel.URL.path;
    }
    return nil;
}

- (NSString *)presentSavePanelWithDefaultName:(NSString *)defaultName {
    NSSavePanel *savePanel = [NSSavePanel savePanel];
    if (@available(macOS 11.0, *)) {
        savePanel.allowedContentTypes = @[[UTType typeWithFilenameExtension:@"md"]];
    } else {
        #pragma clang diagnostic push
        #pragma clang diagnostic ignored "-Wdeprecated-declarations"
        savePanel.allowedFileTypes = @[@"md"];
        #pragma clang diagnostic pop
    }
    savePanel.nameFieldStringValue = defaultName.length > 0 ? defaultName : @"document.md";
    if ([savePanel runModal] == NSModalResponseOK) {
        return savePanel.URL.path;
    }
    return nil;
}

- (NSString *)readStringFromFile:(NSString *)filePath error:(NSError **)error {
    return [NSString stringWithContentsOfFile:filePath
                                     encoding:NSUTF8StringEncoding
                                        error:error];
}

- (BOOL)writeString:(NSString *)string toFile:(NSString *)filePath error:(NSError **)error {
    return [string writeToFile:filePath
                     atomically:YES
                       encoding:NSUTF8StringEncoding
                          error:error];
}

@end
