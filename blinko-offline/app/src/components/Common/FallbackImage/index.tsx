import { useState } from "react";
import { Image, ImageProps } from "@heroui/react";

export const FallbackImage = ({ src, alt, className, ...props }: ImageProps) => {
    const [error, setError] = useState(false);
    const handleError = () => {
        setError(true);
    };

    if (error) {
        return <Image src={'/logo.png'} alt={alt} className={className} {...props} onError={handleError}  />;
    }

    return <Image src={src} alt={alt} className={className} {...props} onError={handleError} fallbackSrc="/logo.png" />;
}