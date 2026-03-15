import { Router } from 'express';
import axios from 'axios';

const router = Router();

// GET /api/zipcode/:code
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    // Remover hífen se houver
    const cleanCode = code.replace(/-/g, '');
    
    // Validar formato (7 dígitos)
    if (!/^\d{7}$/.test(cleanCode)) {
      return res.status(400).json({
        success: false,
        message: { pt: 'CEP inválido', ja: '郵便番号が無効です' }
      });
    }

    // Buscar na API pública japonesa
    const response = await axios.get(`https://zipcloud.ibsnet.co.jp/api/search`, {
      params: { zipcode: cleanCode }
    });

    if (response.data.results === null) {
      return res.status(404).json({
        success: false,
        message: { pt: 'CEP não encontrado', ja: '郵便番号が見つかりません' }
      });
    }

    const result = response.data.results[0];

    res.json({
      success: true,
      data: {
        postalCode: `${cleanCode.slice(0, 3)}-${cleanCode.slice(3)}`,
        prefecture: result.address1,      // 都道府県
        city: result.address2,            // 市区町村
        ward: result.address3,            // 町域
        prefectureKana: result.kana1,     // カナ
        cityKana: result.kana2,
        wardKana: result.kana3,
      }
    });
  } catch (error) {
    console.error('Error fetching zipcode:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar CEP', ja: 'CEP検索エラー' }
    });
  }
});

export default router;
