"use client"

import {ReactNode} from "react"
import {PrivyProvider} from "@privy-io/react-auth"
import {QueryClient, QueryClientProvider} from "@tanstack/react-query"
import { WagmiProvider } from "@privy-io/wagmi"
import { baseSepolia } from "viem/chains"
import {wagmiConfig} from "@/config/wagmi"

const queryClient = new QueryClient()

export default function Providers({children}: {children: ReactNode}) {
    return (
        <PrivyProvider
        appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
        config={{
            appearance: {
                theme: "#030712",
                accentColor: "#06B6D4",
                logo: "",
            },
            embeddedWallets: {
                ethereum: {
                    createOnLogin: "users-without-wallets", // Embedded wallet for Web2 users
                }
            },
            defaultChain: baseSepolia,
            supportedChains: [baseSepolia],
            walletConnectCloudProjectId: process.env.NEXT_PUBLIC_PROJECT_ID || ""
        }}
        >
            <QueryClientProvider client={queryClient}>
                <WagmiProvider config={wagmiConfig}>
                    {children}
                </WagmiProvider>
            </QueryClientProvider>
        </PrivyProvider>
    )
}