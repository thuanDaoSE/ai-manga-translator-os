import { useAuthStore } from '../store/useAuthStore';
import { supabase } from './supabaseClient'; // 🚀 Nhớ import thêm cái này để làm tươi token tự động
import toast from 'react-hot-toast';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_URL = `${BASE_URL}/api`;
const STATIC_URL = `${BASE_URL}/static`;

// 🚀 BỘ NHỚ ĐỆM LƯU TRỮ BONG BÓNG THOẠI ĐỂ CHUYỂN TRANG TỨC THÌ
const bubblesCache: Record<string, any[]> = {};

// 🚀 HÀM HELPER: Kiểm tra phản hồi từ Server và chặn đứng lỗi 401
const handleApiError = async (response: Response, defaultMessage: string) => {
  if (response.status === 401) {
    // 🚀 PHIÊN ĐĂNG NHẬP HẾT HẠN THỰC SỰ -> ÉP BẬT MÀN HÌNH LOGIN NGAY LẬP TỨC
    await useAuthStore.getState().signOut();
    toast.error("Phiên làm việc đã hết hạn! Vui lòng đăng nhập lại.");
    throw new Error("Phiên đăng nhập đã hết hạn!");
  }

  if (!response.ok) {
    let errorMsg = defaultMessage;
    try {
      const errData = await response.json();
      errorMsg = errData.detail || errData.message || `${defaultMessage} (Mã lỗi: ${response.status})`;
    } catch (e) {
      // Bỏ qua nếu lỗi là do Server sập hẳn, không trả về JSON
    }
    throw new Error(errorMsg);
  }
};

// 🚀 NÂNG CẤP THÀNH ASYNC: TỰ ĐỘNG KIỂM TRA VÀ GIA HẠN TOKEN KHI CÓ REQUEST
export const getAuthHeaders = async (isFormData: boolean = false) => {
  let token = useAuthStore.getState().session?.access_token;

  try {
    // 🚀 Phép thuật ở đây: Lấy session từ Supabase client để nó tự gia hạn nếu JWT hết hạn
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      useAuthStore.getState().setUser(session); // Đồng bộ lại token mới vào Zustand Store
      token = session.access_token;
    }
  } catch (err) {
    console.error("Lỗi tự động kiểm tra làm tươi token:", err);
  }

  const headers: any = {};
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

export const mangaApi = {
  getProjects: async () => {
    const response = await fetch(`${API_URL}/projects`, {
      headers: await getAuthHeaders() // Đã thêm await
    });
    await handleApiError(response, "Lỗi tải danh sách dự án");
    return await response.json();
  },

  createProject: async (name: string) => {
    const response = await fetch(`${API_URL}/projects`, {
      method: "POST",
      headers: await getAuthHeaders(), // Đã thêm await
      body: JSON.stringify({ name }),
    });
    await handleApiError(response, "Lỗi tạo dự án");
    return await response.json();
  },

  savePageBubbles: async (pageId: string, bubbles: any[]) => {
    bubblesCache[pageId] = bubbles;
    const response = await fetch(`${API_URL}/pages/${pageId}/bubbles`, {
      method: "POST",
      headers: await getAuthHeaders(), // Đã thêm await
      body: JSON.stringify({ bubbles }),
    });
    return response.ok;
  },

  getPageBubbles: async (pageId: string) => {
    if (bubblesCache[pageId]) {
      return { bubbles: bubblesCache[pageId] };
    }
    const response = await fetch(`${API_URL}/pages/${pageId}/bubbles`, {
      headers: await getAuthHeaders() // Đã thêm await
    });
    if (!response.ok) return { bubbles: [] };
    const data = await response.json();
    bubblesCache[pageId] = data.bubbles || [];
    return data;
  },

  getCachedPageBubbles: (pageId: string) => {
    return bubblesCache[pageId] || null;
  },

  uploadRaw: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await fetch(`${API_URL}/upload-raw`, {
        method: "POST",
        headers: await getAuthHeaders(true), // Đã thêm await
        body: formData
      });
      console.log(`Đã upload ngầm thành công: ${file.name}`);
    } catch (err) {
      console.error("Lỗi upload ngầm:", err);
    }
  },

  translatePage: async (file: File, config: any) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("genre", config.genre);
    formData.append("tone", config.tone);
    formData.append("pronouns", config.pronoun);
    formData.append("glossary", config.glossary);
    formData.append("target_language", config.targetLanguage || "Tiếng Việt");

    const response = await fetch(`${API_URL}/translate`, {
      method: "POST",
      headers: await getAuthHeaders(true), // Đã thêm await
      body: formData,
    });

    await handleApiError(response, "Server từ chối kết nối Dịch thuật!");
    const data = await response.json();

    if (data.status !== "queued") throw new Error("Lỗi Server: Không thể đưa vào hàng đợi");
    const taskId = data.task_id;

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const pollRes = await fetch(`${API_URL}/task/${taskId}`, {
          headers: await getAuthHeaders() // Đã thêm await
        });
        await handleApiError(pollRes, "Mất kết nối đến Server trong lúc chờ kết quả!");
        const pollData = await pollRes.json();

        if (pollData.state === "SUCCESS") {
          return {
            cleanUrl: pollData.result.clean_url,
            bubbles: pollData.result.data,
          };
        } else if (pollData.state === "FAILURE") {
          throw new Error(`AI xử lý thất bại: ${pollData.message || 'Lỗi không xác định'}`);
        } else if (pollData.state === "PROCESSING") {
          console.log(`[CELERY] Tiến độ: ${pollData.progress}% - ${pollData.message}`);
        }
      } catch (err: any) {
        if (err.message.includes('Mất kết nối') || err.message.includes('fetch')) {
          throw new Error("Mất kết nối đến Máy chủ. Vui lòng kiểm tra lại mạng!");
        }
        throw err;
      }
    }
  },

  // 🚀 THÊM pageId VÀO THAM SỐ
  eraseMask: async (imageUrl: string, maskBase64: string, pageId?: string) => {
    const response = await fetch(`${API_URL}/erase-mask`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      // 🚀 NHÉT THÊM page_id VÀO GÓI HÀNG GỬI ĐI
      body: JSON.stringify({ image_url: imageUrl, mask_base64: maskBase64, page_id: pageId })
    });
    await handleApiError(response, "Lỗi xóa nền");
    const data = await response.json();
    if (data.status !== "success") throw new Error(data.message || "Xóa nền thất bại");

    if (data.credits !== undefined) {
      useAuthStore.setState((state) => ({
        user: state.user ? { ...state.user, credits: data.credits } : null
      }));
    }

    let cleanUrl = data.new_url.split('?')[0];
    if (window.location.protocol === 'https:' && cleanUrl.startsWith('http://')) {
      cleanUrl = cleanUrl.replace('http://', 'https://');
    }
    return `${cleanUrl}?t=${Date.now()}`;
  },

  ctdErase: async (imageUrl: string, maskBase64: string, pageId?: string) => {
    const response = await fetch(`${API_URL}/ctd-erase`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ image_url: imageUrl, mask_base64: maskBase64, page_id: pageId })
    });
    await handleApiError(response, "Lỗi xóa chữ");
    const data = await response.json();
    if (data.status !== "success") throw new Error(data.message || "Xóa chữ thất bại");

    if (data.credits !== undefined) {
      useAuthStore.setState((state) => ({
        user: state.user ? { ...state.user, credits: data.credits } : null
      }));
    }

    let cleanUrl = data.new_url.split('?')[0];
    if (window.location.protocol === 'https:' && cleanUrl.startsWith('http://')) {
      cleanUrl = cleanUrl.replace('http://', 'https://');
    }
    return `${cleanUrl}?t=${Date.now()}`;
  },

  aiRedrawMask: async (imageUrl: string, maskBase64: string, prompt: string, translationMode: string, pageId?: string, negativePrompt?: string) => {
    const response = await fetch(`${API_URL}/ai-redraw-mask`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        image_url: imageUrl,
        mask_base64: maskBase64,
        prompt: prompt,
        translation_mode: translationMode,
        page_id: pageId,
        negative_prompt: negativePrompt || ""
      })
    });
    await handleApiError(response, "Lỗi vẽ lại vùng tô bằng AI");
    const data = await response.json();
    if (data.status !== "success") throw new Error(data.message || "Vẽ lại vùng tô bằng AI thất bại");

    if (data.credits !== undefined) {
      useAuthStore.setState((state) => ({
        user: state.user ? { ...state.user, credits: data.credits } : null
      }));
    }

    let cleanUrl = data.new_url.split('?')[0];
    if (window.location.protocol === 'https:' && cleanUrl.startsWith('http://')) {
      cleanUrl = cleanUrl.replace('http://', 'https://');
    }
    return `${cleanUrl}?t=${Date.now()}`;
  },

  redrawMask: async (imageUrl: string, maskBase64: string, prompt: string, pageId?: string, negativePrompt?: string, originalImageHash?: string) => {
    const response = await fetch(`${API_URL}/redraw`, {
      method: "POST",
      headers: await getAuthHeaders(), // Đã thêm await
      body: JSON.stringify({ 
        image_url: imageUrl, 
        mask_base64: maskBase64, 
        prompt, 
        page_id: pageId,
        negative_prompt: negativePrompt,
        original_image_hash: originalImageHash
      }),
    });
    await handleApiError(response, "Lỗi Server Redraw AI");

    const data = await response.json();
    if (data.status !== "success") throw new Error(data.message || "Vẽ lại thất bại");
    
    if (data.credits !== undefined) {
      useAuthStore.setState((state) => ({
        user: state.user ? { ...state.user, credits: data.credits } : null
      }));
    }

    let cleanUrl = data.new_url.split('?')[0];
    if (window.location.protocol === 'https:' && cleanUrl.startsWith('http://')) {
      cleanUrl = cleanUrl.replace('http://', 'https://');
    }
    return `${cleanUrl}?t=${Date.now()}`;
  },

  betaTranslate: async (imageBlob: Blob, maskBlob: Blob, tosAgreed: boolean) => {
    const formData = new FormData();
    formData.append("image", imageBlob, "image.png");
    formData.append("mask", maskBlob, "mask.png");
    formData.append("tos_agreed", String(tosAgreed));

    const response = await fetch(`${BASE_URL}/api/v1/beta-translate`, {
      method: "POST",
      headers: await getAuthHeaders(true), // isFormData = true
      body: formData,
    });
    
    await handleApiError(response, "Lỗi dịch và xóa chữ");
    return await response.blob();
  },


  processRedrawPrompt: async (vietnameseText: string, selectedTags: string[], mode: 'manga' | 'webtoon') => {
    const response = await fetch(`${API_URL}/redraw-prompt`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ vietnameseText, selectedTags, mode }),
    });
    await handleApiError(response, "Lỗi xử lý Prompt vẽ lại");
    return await response.json();
  },

  quickScan: async (payload: any) => {
    const response = await fetch(`${API_URL}/quick-scan`, {
      method: "POST",
      headers: await getAuthHeaders(), // Đã thêm await
      body: JSON.stringify(payload),
    });
    await handleApiError(response, "Lỗi Server Lens Dịch");
    return await response.json();
  },

  copilotChat: async (payload: any) => {
    const response = await fetch(`${API_URL}/copilot/chat`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    await handleApiError(response, "Lỗi Server Trợ Lý AI");
    return await response.json();
  },

  downloadPsd: (pageId: string) => {
    const token = useAuthStore.getState().session?.access_token || "";
    const link = document.createElement('a');
    link.href = `${API_URL}/pages/${pageId}/download-psd?token=${token}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  downloadJsx: (pageId: string) => {
    const token = useAuthStore.getState().session?.access_token || "";
    const link = document.createElement('a');
    link.href = `${API_URL}/pages/${pageId}/jsx?token=${token}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  uploadFont: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_URL}/fonts/upload`, {
      method: "POST",
      headers: await getAuthHeaders(true), // Đã thêm await
      body: formData
    });
    await handleApiError(response, "Lỗi khi tải font lên Server");
    return await response.json();
  },

  getFonts: async () => {
    const response = await fetch(`${API_URL}/fonts`, {
      headers: await getAuthHeaders() // Đã thêm await
    });
    await handleApiError(response, "Lỗi lấy danh sách Font");
    return await response.json();
  },

  downloadFontPack: () => {
    const link = document.createElement('a');
    link.href = "/Manga_Fonts_Pack.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  exportManga: (pageId: string) => {
    const token = useAuthStore.getState().session?.access_token || "";
    const link = document.createElement('a');
    link.href = `${API_URL}/pages/${pageId}/export-manga?token=${token}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
  // 🚀 THÊM 2 HÀM NÀY VÀO ĐỂ GOM TẤT CẢ API VỀ 1 MỐI BẢO MẬT
  uploadProjectFile: async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_URL}/projects/${projectId}/upload`, {
      method: "POST",
      headers: await getAuthHeaders(true),
      body: formData
    });
    await handleApiError(response, "Lỗi upload file!");
    return await response.json();
  },

  deletePage: async (pageId: string) => {
    const response = await fetch(`${API_URL}/pages/${pageId}`, {
      method: "DELETE",
      headers: await getAuthHeaders()
    });
    // Xóa cache cục bộ ngay khi nhận phản hồi (dù thành công hay lỗi)
    delete bubblesCache[pageId];
    // Nếu không thành công (trừ 404 - trang đã bị xóa rồi cũng được), throw để FE biết
    if (!response.ok && response.status !== 404) {
      let detail = `Lỗi xóa trang (${response.status})`;
      try { const d = await response.json(); detail = d.detail || d.message || detail; } catch {}
      throw new Error(detail);
    }
  },
  getProjectPages: async (projectId: string) => {
    const response = await fetch(`${API_URL}/projects/${projectId}/pages`, {
      headers: await getAuthHeaders()
    });
    await handleApiError(response, "Lỗi tải dữ liệu dự án");
    return await response.json();
  },

  getGpuStatus: async () => {
    const response = await fetch(`${API_URL}/gpu/status`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) return { status: "offline" };
    return await response.json();
  },

  importManga: async (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_URL}/projects/${projectId}/import-manga`, {
      method: "POST",
      headers: await getAuthHeaders(true),
      body: formData,
    });
    await handleApiError(response, "Lỗi khi import dự án .manga");
    return await response.json();
  },

  // 🚀 KHAI BÁO HÀM DỊCH LẠI CHỮ MỚI
  retryTextTranslation: async (pageId: string) => {
    const response = await fetch(`${API_URL}/pages/${pageId}/retry-text-translation`, {
      method: "POST",
      headers: await getAuthHeaders() // Tự động gắn Token bảo mật của sếp
    });
    await handleApiError(response, "Lỗi khi gọi lệnh dịch lại chữ");
    return await response.json();
  },
  getUserProfile: async () => {
    const response = await fetch(`${API_URL}/users/me`, {
      headers: await getAuthHeaders()
    });
    await handleApiError(response, "Lỗi lấy thông tin người dùng");
    return await response.json();
  },

  // @deprecated - BỊ BÃI BỎ trong mô hình tính giây thực tế (Không gọi trừ xu trước nữa)
  deductCredits: async (amount: number) => {
    const response = await fetch(`${API_URL}/users/me/deduct?amount=${amount}`, {
      method: "POST",
      headers: await getAuthHeaders()
    });
    await handleApiError(response, "Lỗi trừ credits");
    return await response.json();
  },

  getPaymentHistory: async () => {
    const response = await fetch(`${API_URL}/payment/history`, {
      headers: await getAuthHeaders()
    });
    await handleApiError(response, "Lỗi tải lịch sử giao dịch");
    return await response.json();
  },
  getCreditHistory: async () => {
    const response = await fetch(`${API_URL}/credits/history`, {
      headers: await getAuthHeaders()
    });
    await handleApiError(response, "Lỗi tải lịch sử dùng xu");
    return await response.json();
  },

  translatePageById: async (pageId: string, config: any) => {
    const response = await fetch(`${API_URL}/pages/${pageId}/translate`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        genre: config.genre,
        tone: config.tone,
        pronouns: config.pronouns || config.pronoun,
        glossary: config.glossary,
        target_language: config.targetLanguage || "Tiếng Việt",
        source_language: config.sourceLanguage || config.source_language || "ja",
        client_saw_hot: config.client_saw_hot || false
      }),
    });
    await handleApiError(response, "Lỗi Server Dịch thuật!");
    return await response.json();
  },

  savePageResults: async (pageId: string, cleanUrl: string, bubbles: any[]) => {
    bubblesCache[pageId] = bubbles;
    const response = await fetch(`${API_URL}/pages/${pageId}/save-results?clean_url=${encodeURIComponent(cleanUrl)}`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(bubbles),
    });
    await handleApiError(response, "Lỗi Server Lưu kết quả!");
    return await response.json();
  },

  cancelTask: async (taskId: string) => {
    const response = await fetch(`${API_URL}/tasks/${taskId}/cancel`, {
      method: "POST",
      headers: await getAuthHeaders()
    });
    await handleApiError(response, "Lỗi khi hủy tiến trình!");
    return await response.json();
  },

  createPaymentLink: async (amount: number) => {
    const response = await fetch(`${API_URL}/payments/create-link`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ amount }),
    });
    await handleApiError(response, "Lỗi tạo link thanh toán!");
    return await response.json();
  },

  getPaymentStatus: async (orderCode: number) => {
    const response = await fetch(`${API_URL}/payments/status/${orderCode}`, {
      headers: await getAuthHeaders(),
    });
    await handleApiError(response, "Lỗi kiểm tra trạng thái thanh toán!");
    return await response.json();
  },

  activateRedrawSession: async () => {
    const response = await fetch(`${API_URL}/tools/redraw/activate`, {
      method: "POST",
      headers: await getAuthHeaders(),
    });
    await handleApiError(response, "Lỗi kích hoạt Engine vẽ lại AI!");
    return await response.json();
  },
};