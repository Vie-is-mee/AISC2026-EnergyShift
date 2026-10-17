/**
 * EnergyShift VN - Decision Support System
 * Client-side logic, dataset models & interactive visualizations
 */

// Production scenarios according to EnergyShift proposal
const SCENARIOS = {
  scenario1: {
    id: "scenario1",
    name: "Tuần 37/2026 — Khuyến nghị THAY ĐỔI LỊCH (B2)",
    weekLabel: "Tuần 37/2026 (08/09 - 14/09)",
    verdictType: "change",
    verdictTitle: "THAY ĐỔI LỊCH SẢN XUẤT",
    verdictSubtitle: "Khuyến nghị áp dụng phương án phối hợp B2",
    verdictExplanation: "Phương án B2 thỏa mãn tuyệt đối 5/5 ràng buộc vật lý, tận dụng năng lực linh hoạt giữa máy 160T và 200T để chuyển 3 công việc tiêu thụ lớn tránh hoàn toàn khung giờ cao điểm (3.398 đ/kWh). Sau khi bù trừ chi phí đổi khuôn, phương án giúp tiết kiệm ròng 2.630.000 VNĐ / tuần (14,25%).",
    readinessScore: 94,
    kpis: {
      totalCostB0: 18450000,
      totalCostRec: 15820000,
      savingsAmount: 2630000,
      savingsPct: 14.25,
      electricitySavings: 2980000,
      setupCostChange: 350000,
      jobsShifted: 3,
      peakKwhReduced: 876
    },
    plans: {
      b0: {
        code: "B0",
        name: "Lịch hiện tại của nhà máy",
        desc: "Mốc đối chứng thực tế. Chạy 2 công việc lớn vào khung giờ cao điểm (09:30 - 11:30 và 17:00 - 20:00).",
        totalCost: 18450000,
        electricityCost: 15200000,
        setupCost: 2100000,
        overtimeCost: 1150000,
        status: "Mốc chuẩn đối chứng"
      },
      b1: {
        code: "B1",
        name: "Quy tắc đơn giản (Dời 1 việc)",
        desc: "Dời Đơn A (Vòi xịt) từ giờ cao điểm sang giờ thấp điểm đêm. Không đổi máy.",
        totalCost: 18420000,
        electricityCost: 14450000,
        setupCost: 2450000,
        overtimeCost: 1520000,
        status: "Tiết kiệm 30.000 đ (Chưa đủ tốt)"
      },
      b2: {
        code: "B2",
        name: "Phương án phối hợp (CP-SAT)",
        desc: "Điều chuyển đồng thời Đơn A sang Máy 200T và hoán đổi Đơn C, E để tận dụng tối đa giờ thấp điểm.",
        totalCost: 15820000,
        electricityCost: 12220000,
        setupCost: 2450000,
        overtimeCost: 1150000,
        status: "Khuyến nghị áp dụng (-14.2%)",
        recommended: true
      }
    },
    constraints: [
      { id: "c1", name: "Đủ sản lượng yêu cầu", desc: "6/6 đơn hàng được xếp lịch đủ 100% số lượng sản phẩm, không bỏ sót.", pass: true, label: "6/6 ĐẠT" },
      { id: "c2", name: "Đúng hạn hoàn thành (Due Date)", desc: "100% các lô hàng kết thúc trước thời hạn giao hàng của khách hàng.", pass: true, label: "100% ĐẠT" },
      { id: "c3", name: "Đúng máy & khuôn kỹ thuật", desc: "Các cặp khuôn - máy (Khuôn 8 lòng trên Máy 160T/200T) đã được xưởng xác nhận.", pass: true, label: "XÁC NHẬN" },
      { id: "c4", name: "Không chồng lịch máy", desc: "Không có bất kỳ xung đột thời gian chạy trên cùng một máy ép.", pass: true, label: "KHÔNG XUNG ĐỘT" },
      { id: "c5", name: "Đủ thời gian chuyển đổi khuôn", desc: "Mỗi khoảng nghỉ giữa 2 khuôn đều đảm bảo ≥45 - 60 phút theo quy chuẩn.", pass: true, label: "ĐỦ THỜI GIAN" }
    ],
    sensitivity: [
      { scenario: "THẤP (-15% công suất)", powerEst: "Thấp hơn thực tế", costDelta: "-2.280.000 VNĐ", conclusion: "Vẫn tiết kiệm rõ", stable: true },
      { scenario: "CƠ SỞ (Điểm chuẩn)", powerEst: "Số đo công tơ chuẩn", costDelta: "-2.630.000 VNĐ", conclusion: "Khuyến nghị Thay đổi", stable: true },
      { scenario: "CAO (+15% công suất)", powerEst: "Cao hơn thực tế", costDelta: "-2.990.000 VNĐ", conclusion: "Tiết kiệm lớn hơn nữa", stable: true }
    ],
    sensitivityNote: "Kết luận THAY ĐỔI LỊCH ổn định qua cả 3 kịch bản kiểm tra độ nhạy. Không có rủi ro bị đảo chiều quyết định khi công suất máy dao động ±15%.",
    jobs: [
      { id: "DH-101", name: "Đơn A: Vòi xịt tinh chất (Khuôn 8 lòng)", client: "Seawin / Mỹ phẩm ABC", qty: "45.000 cái", oldMachine: "M1 (160T)", newMachine: "M3 (200T)", oldTime: "09:00 - 15:30 (Cao điểm)", newTime: "22:00 - 04:30 (Thấp điểm)", electricityDelta: "-1.520.000 đ", setupDelta: "+200.000 đ", trust: "meter", trustLabel: "Đo trực tiếp", note: "Chuyển sang máy 200T chạy giờ thấp điểm theo xác nhận tương thích khuôn [7]" },
      { id: "DH-102", name: "Đơn B: Nắp hũ mỹ phẩm 50g", client: "Dược phẩm Trung Ương", qty: "30.000 cái", oldMachine: "M2 (160T)", newMachine: "M2 (160T)", oldTime: "16:00 - 21:00 (Cao điểm)", newTime: "04:00 - 09:00 (Bình thường)", electricityDelta: "-580.000 đ", setupDelta: "0 đ", trust: "raw", trustLabel: "Gốc ERP", note: "Dời lịch sớm hơn 1 ca để hoàn thành trước khung cao điểm sáng" },
      { id: "DH-103", name: "Đơn C: Thân chai Pet 100ml", client: "Hóa mỹ phẩm Nam Long", qty: "60.000 cái", oldMachine: "M4 (200T)", newMachine: "M4 (200T)", oldTime: "07:00 - 14:00", newTime: "07:00 - 14:00", electricityDelta: "0 đ", setupDelta: "0 đ", trust: "meter", trustLabel: "Đo trực tiếp", note: "Giữ nguyên do đã chạy tối ưu trong ca bình thường" },
      { id: "DH-104", name: "Đơn D: Khay định hình linh kiện", client: "Điện tử SamTech", qty: "15.000 cái", oldMachine: "M5 (250T)", newMachine: "M5 (250T)", oldTime: "08:00 - 16:00", newTime: "12:00 - 20:00", electricityDelta: "-430.000 đ", setupDelta: "+150.000 đ", trust: "confirmed", trustLabel: "Nhà máy xác nhận", note: "Hoán đổi vị trí để nhường máy cho đơn hàng cấp bách hơn" },
      { id: "DH-105", name: "Đơn E: Nắp bật chống tràn", client: "Tiêu dùng Minh Quân", qty: "40.000 cái", oldMachine: "M3 (200T)", newMachine: "M1 (160T)", oldTime: "14:00 - 20:00", newTime: "11:30 - 17:30 (Bình thường)", electricityDelta: "-450.000 đ", setupDelta: "0 đ", trust: "raw", trustLabel: "Gốc ERP", note: "Chuyển về máy 160T nhỏ hơn, công suất chạy thấp hơn" },
      { id: "DH-106", name: "Đơn F: Khớp nối kỹ thuật", client: "Cơ khí Việt Nhật", qty: "20.000 cái", oldMachine: "M5 (250T)", newMachine: "M5 (250T)", oldTime: "20:00 - 02:00", newTime: "20:00 - 02:00", electricityDelta: "0 đ", setupDelta: "0 đ", trust: "estimate", trustLabel: "Ước tính kiểm chứng", note: "Đã chạy ca đêm giờ thấp điểm, không cần đổi" }
    ],
    gantt: {
      b0: [
        { machine: "M1", job: "Đơn A (Vòi xịt)", startHour: 9.0, duration: 6.5, setupBefore: 0.75, colorClass: "job-b0" },
        { machine: "M2", job: "Đơn B (Nắp hũ)", startHour: 16.0, duration: 5.0, setupBefore: 0.5, colorClass: "job-b0" },
        { machine: "M3", job: "Đơn E (Nắp bật)", startHour: 13.5, duration: 6.5, setupBefore: 0.75, colorClass: "job-b0" },
        { machine: "M4", job: "Đơn C (Chai Pet)", startHour: 7.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b0" },
        { machine: "M5", job: "Đơn D (Khay)", startHour: 8.0, duration: 8.0, setupBefore: 1.0, colorClass: "job-b0" }
      ],
      b2: [
        { machine: "M1", job: "Đơn E (Nắp bật)", startHour: 11.5, duration: 6.0, setupBefore: 0.75, colorClass: "job-b2" },
        { machine: "M2", job: "Đơn B (Nắp hũ)", startHour: 4.0, duration: 5.0, setupBefore: 0.5, colorClass: "job-b2" },
        { machine: "M3", job: "Đơn A (Vòi xịt)", startHour: 22.0, duration: 6.5, setupBefore: 1.0, colorClass: "job-b2" },
        { machine: "M4", job: "Đơn C (Chai Pet)", startHour: 7.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b2" },
        { machine: "M5", job: "Đơn D (Khay)", startHour: 12.0, duration: 8.0, setupBefore: 1.0, colorClass: "job-b2" }
      ],
      b1: [
        { machine: "M1", job: "Đơn A (Vòi xịt)", startHour: 22.0, duration: 6.5, setupBefore: 0.75, colorClass: "job-b1" },
        { machine: "M2", job: "Đơn B (Nắp hũ)", startHour: 16.0, duration: 5.0, setupBefore: 0.5, colorClass: "job-b0" },
        { machine: "M3", job: "Đơn E (Nắp bật)", startHour: 13.5, duration: 6.5, setupBefore: 0.75, colorClass: "job-b0" },
        { machine: "M4", job: "Đơn C (Chai Pet)", startHour: 7.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b0" },
        { machine: "M5", job: "Đơn D (Khay)", startHour: 8.0, duration: 8.0, setupBefore: 1.0, colorClass: "job-b0" }
      ]
    }
  },

  scenario2: {
    id: "scenario2",
    name: "Tuần 38/2026 — Khuyến nghị DÙNG QUY TẮC ĐƠN GIẢN (B1)",
    weekLabel: "Tuần 38/2026 (15/09 - 21/09)",
    verdictType: "simple",
    verdictTitle: "DÙNG QUY TẮC ĐƠN GIẢN (B1)",
    verdictSubtitle: "Quy tắc đơn lẻ đã đạt 96% lợi ích tối đa",
    verdictExplanation: "Phương án B1 (chỉ chuyển 1 đơn hàng khuôn nắp chai sang ca sáng thấp điểm) đã giúp tiết kiệm 1.950.000 VNĐ. Phương án phối hợp B2 chỉ tiết kiệm thêm 80.000 VNĐ nhưng đòi hỏi xáo trộn 4 máy và phát sinh thêm 2 lần đổi khuôn. Theo nguyên tắc sản phẩm, hệ thống đề xuất áp dụng B1 để giảm thiểu rủi ro vận hành.",
    readinessScore: 92,
    kpis: {
      totalCostB0: 17200000,
      totalCostRec: 15250000,
      savingsAmount: 1950000,
      savingsPct: 11.34,
      electricitySavings: 1950000,
      setupCostChange: 0,
      jobsShifted: 1,
      peakKwhReduced: 620
    },
    plans: {
      b0: {
        code: "B0",
        name: "Lịch hiện tại của nhà máy",
        desc: "Kế hoạch tuần 38 theo ca tiêu chuẩn. Đơn hàng Nắp chai chạy lúc 17:00 giờ cao điểm chiều.",
        totalCost: 17200000,
        electricityCost: 14100000,
        setupCost: 1900000,
        overtimeCost: 1200000,
        status: "Mốc chuẩn đối chứng"
      },
      b1: {
        code: "B1",
        name: "Quy tắc đơn giản (Dời 1 việc)",
        desc: "Dời duy nhất lô Nắp chai sang khung giờ 04:00 - 09:00 sáng. Giữ nguyên toàn bộ các máy khác.",
        totalCost: 15250000,
        electricityCost: 12150000,
        setupCost: 1900000,
        overtimeCost: 1200000,
        status: "Khuyến nghị áp dụng (-11.3%)",
        recommended: true
      },
      b2: {
        code: "B2",
        name: "Phương án phối hợp (CP-SAT)",
        desc: "Đổi cả 4 máy ép để cố gắng ép thêm tiền điện. Chi phí phát sinh triệt tiêu lợi nhuận.",
        totalCost: 15170000,
        electricityCost: 11620000,
        setupCost: 2350000,
        overtimeCost: 1200000,
        status: "Tốt hơn B1 chỉ 80.000đ (Không đáng đổi)"
      }
    },
    constraints: [
      { id: "c1", name: "Đủ sản lượng yêu cầu", desc: "Tất cả đơn hàng đạt 100% sản lượng cam kết.", pass: true, label: "ĐẠT" },
      { id: "c2", name: "Đúng hạn hoàn thành", desc: "Giao hàng đúng hạn hợp đồng.", pass: true, label: "ĐẠT" },
      { id: "c3", name: "Đúng máy & khuôn kỹ thuật", desc: "Không đổi máy, sử dụng máy hiện hành.", pass: true, label: "ĐẠT" },
      { id: "c4", name: "Không chồng lịch máy", desc: "Không có xung đột thời gian.", pass: true, label: "ĐẠT" },
      { id: "c5", name: "Đủ thời gian chuyển đổi khuôn", desc: "Thời gian setup giữ nguyên như ban đầu.", pass: true, label: "ĐẠT" }
    ],
    sensitivity: [
      { scenario: "THẤP (-15%)", powerEst: "Công suất thấp", costDelta: "-1.720.000 VNĐ", conclusion: "B1 vẫn tối ưu", stable: true },
      { scenario: "CƠ SỞ", powerEst: "Số đo chuẩn", costDelta: "-1.950.000 VNĐ", conclusion: "Khuyến nghị B1", stable: true },
      { scenario: "CAO (+15%)", powerEst: "Công suất cao", costDelta: "-2.180.000 VNĐ", conclusion: "B1 vẫn tối ưu", stable: true }
    ],
    sensitivityNote: "Phương án B1 rất an toàn và ổn định. Khoảng cách chênh lệch giữa B1 và B2 không vượt quá 100.000 VNĐ trong mọi trường hợp.",
    jobs: [
      { id: "DH-201", name: "Đơn Nắp chai mỹ phẩm 24/410", client: "Dược mỹ phẩm Á Châu", qty: "50.000 cái", oldMachine: "M2 (160T)", newMachine: "M2 (160T)", oldTime: "17:00 - 22:00 (Cao điểm)", newTime: "04:00 - 09:00 (Bình thường)", electricityDelta: "-1.950.000 đ", setupDelta: "0 đ", trust: "meter", trustLabel: "Đo trực tiếp", note: "Dời lịch chạy sớm, không đổi máy, không phát sinh chi phí khuôn" }
    ],
    gantt: {
      b0: [
        { machine: "M2", job: "Nắp chai (17:00 - 22:00)", startHour: 17.0, duration: 5.0, setupBefore: 0.5, colorClass: "job-b0" },
        { machine: "M3", job: "Thân hũ (08:00 - 15:00)", startHour: 8.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b0" }
      ],
      b1: [
        { machine: "M2", job: "Nắp chai (04:00 - 09:00)", startHour: 4.0, duration: 5.0, setupBefore: 0.5, colorClass: "job-b1" },
        { machine: "M3", job: "Thân hũ (08:00 - 15:00)", startHour: 8.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b0" }
      ],
      b2: [
        { machine: "M1", job: "Nắp chai (04:00 - 09:00)", startHour: 4.0, duration: 5.0, setupBefore: 0.75, colorClass: "job-b2" },
        { machine: "M4", job: "Thân hũ (12:00 - 19:00)", startHour: 12.0, duration: 7.0, setupBefore: 1.0, colorClass: "job-b2" }
      ]
    }
  },

  scenario3: {
    id: "scenario3",
    name: "Tuần 39/2026 — Khuyến nghị GIỮ LỊCH HIỆN TẠI (B0)",
    weekLabel: "Tuần 39/2026 (22/09 - 28/09)",
    verdictType: "keep",
    verdictTitle: "GIỮ NGUYÊN LỊCH HIỆN TẠI (B0)",
    verdictSubtitle: "Chi phí phát sinh lớn hơn số tiền điện tiết kiệm được",
    verdictExplanation: "Mặc dù dời đơn hàng sang ban đêm giúp giảm được 850.000 VNĐ tiền điện, nhưng lại phát sinh thêm 1.100.000 VNĐ tiền phụ cấp làm thêm giờ (Overtime ca 3) và 400.000 VNĐ chi phí chuẩn bị khuôn đột xuất. Tổng chi phí vận hành tăng thêm 650.000 VNĐ. Hệ thống bảo vệ người dùng bằng khuyến nghị GIỮ LỊCH HIỆN TẠI.",
    readinessScore: 89,
    kpis: {
      totalCostB0: 16100000,
      totalCostRec: 16750000,
      savingsAmount: -650000,
      savingsPct: -4.04,
      electricitySavings: 850000,
      setupCostChange: 400000,
      jobsShifted: 0,
      peakKwhReduced: 250
    },
    plans: {
      b0: {
        code: "B0",
        name: "Lịch hiện tại của nhà máy",
        desc: "Lịch vận hành ổn định trong ca tiêu chuẩn. Không phát sinh chi phí làm thêm ca đêm.",
        totalCost: 16100000,
        electricityCost: 13300000,
        setupCost: 1800000,
        overtimeCost: 1000000,
        status: "Khuyến nghị Giữ nguyên",
        recommended: true
      },
      b1: {
        code: "B1",
        name: "Quy tắc đơn giản (Dời sang đêm)",
        desc: "Dời sang 23:00 để lấy điện rẻ, nhưng làm tăng chi phí ca đêm vượt quá số tiền điện giảm.",
        totalCost: 16750000,
        electricityCost: 12450000,
        setupCost: 2200000,
        overtimeCost: 2100000,
        status: "Lỗ ròng 650.000 đ (Bị loại)"
      },
      b2: {
        code: "B2",
        name: "Phương án phối hợp (CP-SAT)",
        desc: "Không tìm được phương án nào bù đắp được chi phí chuyển đổi do đặc thù khuôn đợt này.",
        totalCost: 16820000,
        electricityCost: 12320000,
        setupCost: 2400000,
        overtimeCost: 2100000,
        status: "Không kinh tế (Bị loại)"
      }
    },
    constraints: [
      { id: "c1", name: "Đủ sản lượng yêu cầu", desc: "Đạt yêu cầu sản lượng.", pass: true, label: "ĐẠT" },
      { id: "c2", name: "Đúng hạn hoàn thành", desc: "Đạt tiến độ giao hàng.", pass: true, label: "ĐẠT" },
      { id: "c3", name: "Đúng máy & khuôn kỹ thuật", desc: "Đạt thông số kỹ thuật.", pass: true, label: "ĐẠT" },
      { id: "c4", name: "Không chồng lịch máy", desc: "Không chồng chéo.", pass: true, label: "ĐẠT" },
      { id: "c5", name: "Đủ thời gian chuyển đổi khuôn", desc: "Thời gian thay khuôn hợp lệ.", pass: true, label: "ĐẠT" }
    ],
    sensitivity: [
      { scenario: "THẤP", powerEst: "Ước tính thấp", costDelta: "+450.000 VNĐ", conclusion: "Giữ B0", stable: true },
      { scenario: "CƠ SỞ", powerEst: "Số đo chuẩn", costDelta: "+650.000 VNĐ", conclusion: "Giữ B0", stable: true },
      { scenario: "CAO", powerEst: "Ước tính cao", costDelta: "+820.000 VNĐ", conclusion: "Giữ B0", stable: true }
    ],
    sensitivityNote: "Nguyên tắc bảo vệ người dùng: Hệ thống tuyệt đối không bao giờ khuyến nghị thay đổi chỉ vì tiền điện rẻ khi tổng chi phí vận hành tăng lên.",
    jobs: [
      { id: "DH-301", name: "Đơn Nắp hũ kem chống nắng", client: "Mỹ phẩm Đông Á", qty: "35.000 cái", oldMachine: "M1 (160T)", newMachine: "M1 (160T)", oldTime: "10:00 - 17:00", newTime: "10:00 - 17:00 (Giữ nguyên)", electricityDelta: "0 đ", setupDelta: "0 đ", trust: "meter", trustLabel: "Đo trực tiếp", note: "Giữ nguyên lịch ban ngày để tránh chi phí làm thêm giờ ca đêm" }
    ],
    gantt: {
      b0: [
        { machine: "M1", job: "Nắp hũ kem (10:00 - 17:00)", startHour: 10.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b0" }
      ],
      b1: [
        { machine: "M1", job: "Nắp hũ kem (23:00 - 06:00)", startHour: 23.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b1" }
      ],
      b2: [
        { machine: "M1", job: "Nắp hũ kem (23:00 - 06:00)", startHour: 23.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b2" }
      ]
    }
  },

  scenario4: {
    id: "scenario4",
    name: "Tuần 40/2026 — Khuyến nghị ĐO THÊM TRƯỚC KHI QUYẾT ĐỊNH",
    weekLabel: "Tuần 40/2026 (29/09 - 05/10)",
    verdictType: "measure",
    verdictTitle: "ĐO THÊM TRƯỚC KHI QUYẾT ĐỊNH",
    verdictSubtitle: "Dữ liệu điện năng chưa chắc chắn làm đảo chiều kết luận",
    verdictExplanation: "Công suất tiêu thụ của Máy M3 khi chạy Khuôn K-802 mới chỉ là số liệu ước tính gián tiếp (chưa có công tơ riêng). Khi thử nghiệm 3 kịch bản: mức THẤP cho kết quả nên đổi (+780.000đ), nhưng mức CAO lại cho kết quả lỗ (-310.000đ). Hệ thống yêu cầu lắp công tơ đo đếm tại Máy M3 trước khi phê duyệt đổi lịch.",
    readinessScore: 68,
    kpis: {
      totalCostB0: 19100000,
      totalCostRec: 18950000,
      savingsAmount: 150000,
      savingsPct: 0.78,
      electricitySavings: 450000,
      setupCostChange: 300000,
      jobsShifted: 0,
      peakKwhReduced: 120
    },
    plans: {
      b0: {
        code: "B0",
        name: "Lịch hiện tại của nhà máy",
        desc: "Lịch hiện hành tuần 40. Dữ liệu công suất máy M3 đang dùng ước tính lý thuyết.",
        totalCost: 19100000,
        electricityCost: 15800000,
        setupCost: 2100000,
        overtimeCost: 1200000,
        status: "Đang kiểm tra"
      },
      b1: {
        code: "B1",
        name: "Quy tắc đơn giản",
        desc: "Chưa đủ dữ liệu tin cậy để xác lập lợi ích kinh tế.",
        totalCost: 19050000,
        electricityCost: 15750000,
        setupCost: 2100000,
        overtimeCost: 1200000,
        status: "Chưa đủ chắc chắn"
      },
      b2: {
        code: "B2",
        name: "Phương án phối hợp",
        desc: "Phương án có thể tạo lợi ích nhưng rủi ro đảo chiều cao do thiếu công tơ đo đếm.",
        totalCost: 18950000,
        electricityCost: 15350000,
        setupCost: 2400000,
        overtimeCost: 1200000,
        status: "Tạm dừng phê duyệt"
      }
    },
    constraints: [
      { id: "c1", name: "Đủ sản lượng yêu cầu", desc: "Đạt yêu cầu.", pass: true, label: "ĐẠT" },
      { id: "c2", name: "Đúng hạn hoàn thành", desc: "Đạt tiến độ.", pass: true, label: "ĐẠT" },
      { id: "c3", name: "Đúng máy & khuôn kỹ thuật", desc: "Cần kiểm tra lại định mức máy M3.", pass: false, label: "CẦN ĐO" },
      { id: "c4", name: "Không chồng lịch máy", desc: "Không chồng chéo.", pass: true, label: "ĐẠT" },
      { id: "c5", name: "Đủ thời gian chuyển đổi khuôn", desc: "Thời gian setup hợp lệ.", pass: true, label: "ĐẠT" }
    ],
    sensitivity: [
      { scenario: "THẤP (Công suất ước tính 38 kW)", powerEst: "Giả định thấp", costDelta: "-780.000 VNĐ", conclusion: "Có vẻ nên đổi", stable: false },
      { scenario: "CƠ SỞ (Công suất ước tính 42 kW)", powerEst: "Mức trung tâm", costDelta: "-150.000 VNĐ", conclusion: "Chỉ tốt hơn rất ít", stable: false },
      { scenario: "CAO (Công suất ước tính 48 kW)", powerEst: "Giả định cao", costDelta: "+310.000 VNĐ", conclusion: "KHÔNG CÒN LỢI", stable: false }
    ],
    sensitivityNote: "CẢNH BÁO ĐẢO CHIỀU KẾT LUẬN: Vì 3 kịch bản cho 3 kết luận đối lập nhau, hệ thống chỉ định vị trí cần đo thêm: Công tơ điện tử trên Máy M3 (Khuôn K-802) trong 2 ca chạy thử nghiệm.",
    jobs: [
      { id: "DH-401", name: "Đơn Chai xịt khoáng (Khuôn K-802)", client: "Dược phẩm Sao Mai", qty: "40.000 cái", oldMachine: "M3 (200T)", newMachine: "M3 (200T)", oldTime: "11:00 - 18:00", newTime: "Chưa xác định", electricityDelta: "Dao động", setupDelta: "Chưa xác định", trust: "estimate", trustLabel: "Ước tính gián tiếp", note: "CẦN ĐO THÊM: Thiếu công tơ điện tử độc lập trên máy M3" }
    ],
    gantt: {
      b0: [
        { machine: "M3", job: "Chai xịt khoáng (K-802)", startHour: 11.0, duration: 7.0, setupBefore: 1.0, colorClass: "job-b0" }
      ],
      b1: [
        { machine: "M3", job: "Chai xịt khoáng (K-802)", startHour: 11.0, duration: 7.0, setupBefore: 1.0, colorClass: "job-b1" }
      ],
      b2: [
        { machine: "M3", job: "Chai xịt khoáng (K-802)", startHour: 22.0, duration: 7.0, setupBefore: 1.0, colorClass: "job-b2" }
      ]
    }
  }
};

// Application State