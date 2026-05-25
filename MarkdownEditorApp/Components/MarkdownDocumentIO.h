#import <Cocoa/Cocoa.h>

@interface MarkdownDocumentIO : NSObject

- (BOOL)confirmDiscardUnsavedChanges;
- (NSString *)presentOpenPanel;
- (NSString *)presentSavePanelWithDefaultName:(NSString *)defaultName;
- (NSString *)readStringFromFile:(NSString *)filePath error:(NSError **)error;
- (BOOL)writeString:(NSString *)string toFile:(NSString *)filePath error:(NSError **)error;

@end
