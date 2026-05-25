#import <Cocoa/Cocoa.h>

@class MarkdownEditorWindowCoordinator;

@interface AppDelegate : NSObject <NSApplicationDelegate>

@property (strong, nonatomic) MarkdownEditorWindowCoordinator *windowCoordinator;

@end
