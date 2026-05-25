import { Avatar, Card, CardBody } from "@heroui/react";
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { RootStore } from "@/store";
import { AiStore } from "@/store/aiStore";
import { BlinkoChatBox } from "@/components/BlinkoAi/aiChatBox";
import i18n from "@/lib/i18n";
import { Icon } from "@iconify/react";
import { api } from "@/lib/trpc";
import { getBlinkoEndpoint } from "@/lib/blinkoEndpoint";

interface SharedConversation {
    id: number;
    title: string;
    createdAt: Date;
    messages: Array<{
        id: number;
        content: string;
        role: string;
        createdAt: Date;
        metadata?: any;
    }>;
    account: {
        name: string;
        nickname: string;
        image: string;
    };
}

const AiSharePage = observer(() => {
    const { id } = useParams<{ id: string }>();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [conversation, setConversation] = useState<SharedConversation | null>(null);
    const aiStore = RootStore.Get(AiStore);

    useEffect(() => {
        const loadConversation = async () => {
            if (!id) {
                setError(i18n.t('conversation-id-missing'));
                setIsLoading(false);
                return;
            }

            try {
                // Call the public API to get shared conversation
                const data = await api.conversation.publicDetail.query({ shareId: id });
                setConversation(data);

                // Transform the data to match the aiStore format for display
                const transformedMessages = data.messages.map(msg => ({
                    ...msg,
                    createdAt: new Date(msg.createdAt),
                    metadata: msg.metadata || {}
                }));

                // Set the conversation in aiStore for BlinkoChatBox to display
                aiStore.currentConversation.value = {
                    id: data.id,
                    title: data.title,
                    isShare: true,
                    accountId: data.account ? 1 : 1, // placeholder since we don't need this for display
                    messages: transformedMessages,
                    createdAt: new Date(data.createdAt),
                    updatedAt: new Date(data.createdAt)
                };

                setIsLoading(false);

            } catch (error) {
                console.error('Failed to load conversation:', error);
                setError(i18n.t('conversation-not-found'));
                setIsLoading(false);
            }
        };

        loadConversation();
    }, [id]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Icon icon="eos-icons:three-dots-loading" width="40" height="40" className="text-desc" />
                    <p className="text-desc">{i18n.t('loading-shared-conversation')}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Card className="max-w-md mx-auto">
                    <CardBody className="text-center">
                        <Icon icon="hugeicons:alert-circle" width="48" height="48" className="text-red-500 mx-auto mb-4" />
                        <h2 className="text-lg font-semibold mb-2">{i18n.t('load-failed')}</h2>
                        <p className="text-desc">{error}</p>
                    </CardBody>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Share Header */}
            <div className="bg-background/80 backdrop-blur-sm sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {
                                conversation?.account?.image ?
                                    <Avatar className="w-10 h-10" src={getBlinkoEndpoint(conversation?.account?.image)} />
                                    :
                                    <Icon icon="eos-icons:three-dots-loading" width="40" height="40" className="text-desc" />
                            }
                            <div className="flex flex-col">
                                <h1 className="text-lg font-semibold">{conversation?.title || i18n.t('ai-conversation-share')}</h1>
                                <p className="text-xs text-desc">
                                    {i18n.t('shared-by')}: {conversation?.account?.nickname || conversation?.account?.name}
                                </p>
                            </div>
                        </div>
                        <div className="text-xs text-desc">{i18n.t('powered-by-blinko')}</div>
                    </div>
                </div>
            </div>

            {/* Chat Content */}
            <div className="max-w-4xl mx-auto h-[calc(100vh-100px)]">
                <BlinkoChatBox shareMode={true} />
            </div>
        </div>
    );
});

export default AiSharePage; 