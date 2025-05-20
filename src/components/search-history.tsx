"use client";

import { useState, useEffect } from "react";
import { Clock, Trash2, ExternalLink } from "lucide-react";
import {
  getSearchHistory,
  SearchHistoryItem,
  removeFromSearchHistory,
  clearSearchHistory
} from "@/lib/search-history";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import ClientOnly from "./client-only";

interface SearchHistoryProps {
  onSelectUrl: (url: string) => void;
}

export function SearchHistory({ onSelectUrl }: SearchHistoryProps) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [isClient, setIsClient] = useState(false);

  // Fungsi untuk memformat tanggal
  const formatDate = (timestamp: number) => {
    if (typeof window === 'undefined') return '';

    try {
      return new Date(timestamp).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return new Date(timestamp).toString();
    }
  };

  // Fungsi untuk memuat riwayat pencarian
  const loadHistory = () => {
    const items = getSearchHistory();
    setHistory(items);
  };

  // Fungsi untuk menghapus item dari riwayat
  const handleRemoveItem = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeFromSearchHistory(url);
    loadHistory();
    toast.success("Item berhasil dihapus dari riwayat");
  };

  // Fungsi untuk menghapus semua riwayat
  const handleClearHistory = () => {
    clearSearchHistory();
    loadHistory();
    toast.success("Riwayat pencarian berhasil dihapus");
  };

  // Fungsi untuk memilih URL dari riwayat
  const handleSelectUrl = (url: string) => {
    onSelectUrl(url);
  };

  // Efek untuk memuat riwayat saat komponen dimuat
  useEffect(() => {
    setIsClient(true);
    loadHistory();
  }, []);

  // Jika tidak ada riwayat atau belum di client-side, tampilkan pesan
  if (!isClient || history.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-md mx-auto mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium flex items-center">
          <Clock className="h-4 w-4 mr-2" />
          Riwayat Pencarian
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearHistory}
          className="h-8 px-2 text-xs"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Hapus Semua
        </Button>
      </div>

      <div className="bg-card rounded-md border overflow-hidden">
        <div className="divide-y">
          {history.map((item, index) => (
            <div
              key={index}
              className="p-3 hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => handleSelectUrl(item.url)}
            >
              <div className="flex justify-between items-start">
                <div className="truncate flex-1">
                  <p className="text-sm font-medium truncate">
                    {item.title || "URL Survei"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-1">
                    {item.url}
                  </p>
                </div>
                <div className="flex items-center ml-2">
                  {item.platform && (
                    <Badge
                      variant="outline"
                      className="mr-2 text-xs h-5 px-1.5"
                    >
                      {item.platform}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => handleRemoveItem(item.url, e)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Hapus</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    asChild
                  >
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="sr-only">Buka</span>
                    </a>
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                <ClientOnly>
                  {formatDate(item.timestamp)}
                </ClientOnly>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
