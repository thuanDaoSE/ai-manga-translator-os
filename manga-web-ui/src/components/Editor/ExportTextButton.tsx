import React from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';

export interface TextBlock {
  original: string;
  translated: string;
}

export interface PageData {
  pageNumber: number;
  textBlocks: TextBlock[];
}

/**
 * Hàm tiện ích xuất bản dịch ra file .txt
 */
export const exportTranslationToText = (pagesData: PageData[]) => {
  const lines: string[] = [];

  pagesData.forEach((page) => {
    const pageStr = String(page.pageNumber).padStart(2, '0');
    lines.push(`--- Trang ${pageStr} ---`);
    
    if (page.textBlocks && page.textBlocks.length > 0) {
      page.textBlocks.forEach((block) => {
        lines.push(`[Gốc]: ${block.original}`);
        lines.push(`[Dịch]: ${block.translated}`);
        lines.push(''); // Dòng trống giữa các block
      });
    } else {
      lines.push('(Không có chữ)');
      lines.push('');
    }
    lines.push(''); // Dòng trống giữa các trang
  });

  const fileContent = lines.join('\n').trim();

  // Tạo và tải file txt qua Blob
  const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Ban_Dich_DeepKoma.txt';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

interface ExportTextButtonProps {
  data: PageData[];
}

export const ExportTextButton: React.FC<ExportTextButtonProps> = ({ data }) => {
  const handleExport = () => {
    try {
      exportTranslationToText(data);
      toast.success("Đã xuất file thành công!");
    } catch (error) {
      console.error("Lỗi xuất file dịch:", error);
      toast.error("Có lỗi xảy ra khi xuất file!");
    }
  };

  return (
    <button
      onClick={handleExport}
      className="bg-gray-800 hover:bg-gray-700 text-white text-sm px-3 py-1.5 rounded flex items-center gap-2 transition-colors duration-200 cursor-pointer"
    >
      <Download size={16} />
      <span>Xuất file Text</span>
    </button>
  );
};
