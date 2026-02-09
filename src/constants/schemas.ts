//import { Label } from "@radix-ui/react-label";
import { FormSchema } from "../types/schema";

// Label: 모달창의 필드 제목
// type: 필드의 형식
// readOnly: 자동으로 생성되거나 변경할수 없는 필드에 대한 표시
// colSpan: 모달의 총 가로 3칸중(프로그램에서 그렇게 만들었음) 몇칸을 차지 할것인지
// placeholder: 필드 입력칸에 디폴트로 기록될 내용
// section: 여러게의 필드를 모아 하나의 그룹으로 표시하기 위해 그룹의 가장 위 필드에 붙이면 그룹명이 생김
// breakRow: 강제로 다음칸 부터 시작하도록

export const CUSTOMER_SCHEMA: FormSchema = {
  // --- [기본 정보] 섹션 ---
  id: { label: "Customer ID", type: "text", readOnly: true, colSpan: 1, placeholder: "Auto Generate", section: "Basic Info" },
  name: { label: "Customer Name", type: "text", colSpan: 1 },
  password: { label: "Login Password", type: "password", colSpan: 1 },
  company: { label: "company", type: "text", colSpan: 1, placeholder: "example pty ltd" },
  abn: { label: "ABN", type: "text", colSpan: 1, placeholder: "11 digits", breakRow: true },
  login_permit: { label: "Login Permit", type: "checkbox", colSpan: 1 },
  disable_order: { label: "Disable Order", type: "checkbox", colSpan: 1 },
  created_at: { label: "Creadted", type: "date", readOnly: true, colSpan: 1 },

  // billing 에 관련된 정보
  due_date: { label: "Payment Terms (Due Date)", type: "select", options: ["C.O.D (Cash on Delivery)", "7 Days", "14 Days", "30 Days", "E.O.M (End of Month)"], section: "Billing Information" },
  credit_limit: { label: "Credit Limit", type: "number", colSpan: 1 },

  // --- [연락처] 섹션 ---
  mobile: { label: "Mobile", type: "text", colSpan: 1, section: "Contact" },
  tel: { label: "Telephone", type: "text", colSpan: 1 },
  email: { label: "Email Address", type: "text", colSpan: 1, placeholder: "example@mail.com", breakRow: true },

  // --- [주소 정보] 섹션 ---
  address: { label: "Address", type: "text", colSpan: 2, section: "Address", breakRow: true },
  state: { label: "State", type: "select", options: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"], colSpan: 1 },
  suburb: { label: "Suburb", type: "select", options: [], colSpan: 1 }, // 로직에서 채워질 예정
  postcode: { label: "Postcode", type: "text", colSpan: 1, readOnly: true, placeholder: "Auto Generate" },

  same_as_address: { label: "Delivery address is the same as customer address", type: "checkbox", colSpan: 2, breakRow: true },

  // --- [배송 주소 정보] 섹션 ---
  delivery_address: { label: "Address", type: "text", colSpan: 2, section: "Delivery Address", breakRow: true },
  delivery_state: { label: "State", type: "select", options: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"], colSpan: 1 },
  delivery_suburb: { label: "Suburb", type: "select", options: [], colSpan: 1 }, // 로직에서 채워질 예정
  delivery_postcode: { label: "Postcode", type: "text", colSpan: 1, readOnly: true, placeholder: "Auto Generate" },
  
  note: { label: "Note", type: "textarea", colSpan: 3, placeholder: "여기에 상세 내용을 입력하세요 (엔터로 줄바꿈 가능)", section: "ETC" },
};

export const STAFF_SCHEMA: FormSchema = {
  //Basic info
  display_name: { label: "Name", type: "text", colSpan: 2, placeholder: "홍길동", section: "Basic Info" },
  birth_date: { label: "Date of Birth", type: "date", colSpan: 1, placeholder: "YYYYMMdd" },
  email: { label: "Email", type: "text", colSpan: 2, placeholder: "example@company.com" },
  phone_number: { label: "mobile", type: "text", colSpan: 1, placeholder: "xxxx xxx xxx" },
  address: { label: "address", type: "text", colSpan: 3, placeholder: "" },
  
  // Permit
  user_level: { label: "Modify Level", type: "select", options: ["MASTER, ADMIN (All)", "MANAGER (All except Del)", "STAFF (read only)", "DRIVER (Delivery Only)"], section: "PERMIT" },
  login_permit:{label: "Login Permit", type: "checkbox", colSpan: 1, placeholder: ""},
  created_at:{label: "Created", type: "date", readOnly: true, colSpan: 1, placeholder: ""},
};

export const PRODUCT_SCHEMA: FormSchema = {
  //Basic info
  id: { label: "ID", type: "text", readOnly: true, colSpan: 1, placeholder: "Auto Generate", section: "Basic Info" },
  location: { label: "Location", type: "text", colSpan: 1, placeholder: "ex AA-11"},
  created_at:{label: "Created", type: "date", readOnly: true, colSpan: 1, placeholder: ""},
  gst:{label: "GST", type: "checkbox", colSpan: 1, placeholder: ""},
  product_name: { label: "Name", type: "text", colSpan: 3, placeholder: ""  },
  product_image: { label: "Image", type: "text", colSpan: 1, placeholder: "Link Web Storage Later"},
  product_barcode: { label: "Barcode", type: "text", colSpan: 1, readOnly: true, placeholder: "Auto Generate" },
  
  //classification
  category_id: { label: "Category", type: "select", colSpan: 1, placeholder: "--select---", options: [], section: "Calssification" },
  vendor_id: { label: "Vendor", type: "select", colSpan: 1, placeholder: "--select---", options: [] },
  vendor_product_id: { label: "Vendor Product ID", type: "text", colSpan: 1, placeholder: "" },
  
  // Price
  buy_price: { label: "Cost", type: "number", colSpan: 1, placeholder: "ex 100.00", section: "Price"  },
  default_unit_id: { label: "Default Unit", type: "select", colSpan: 1, options: ["ctn", "pack", "drum"] },
  total_pack_ctn:{label: "Packs in ctn", type: "number", colSpan: 1, placeholder: ""},
  sell_price_ctn: { label: "Sell Price (ctn)", type: "number", colSpan: 1, placeholder: "ex 100.00" },
  margin_ctn:{label: "Margin (ctn, %)", type: "number", colSpan: 1, placeholder: "", breakRow: true},
  sell_price_pack:{label: "Sell Price(Pack)", type: "number", colSpan: 1, placeholder: "ex 100.00"},
  margin_pack:{label: "Margin(Pack, %)", type: "number", colSpan: 1, placeholder: ""},
  
  //Stock
  current_stock_level:{label: "Current Stock Level", type: "number", colSpan: 1, placeholder: "",section: "Stock"},
  min_stock_level:{label: "Set Reorder Level", type: "number", colSpan: 1, placeholder: ""},
};

export const CATEGORY_SCHEMA: FormSchema = {
  id: { label: "ID", type: "text", readOnly: true, colSpan: 1, placeholder: "Auto Generate", section: "Basic Info" },
  created_at:{label: "Created", type: "date", readOnly: true, colSpan: 1, placeholder: ""},
  category_name: { label: "Category Name", type: "text", placeholder: "e.g. Electronics", colSpan: 3, breakRow: true },
  description: { label: "Description", type: "textarea", placeholder: "Simple description...", colSpan: 3,},
  
};

export const VENDOR_SCHEMA: FormSchema = {
  // 1. 기본 정보
  id: { label: "ID", type: "text", readOnly: true, colSpan: 1, placeholder: "Auto Generate", section: "Basic Info" },
  abn: { label: "ABN", type: "text", colSpan: 1, placeholder: "ABN Number" },
  vendor_name: { label: "Vendor Name", type: "text", colSpan: 2, placeholder: "Business Name"  },
  
  // 2. 연락처 정보
  contact_person: { label: "Contact Person", type: "text", colSpan: 1, section: "Contact Information" },
  mobile: { label: "Mobile", type: "text", colSpan: 1 },
  tel: { label: "Telephone", type: "text", colSpan: 1 },
  email: { label: "Email", type: "text", colSpan: 2, placeholder: "example@company.com" },
  website: { label: "Website", type: "text", colSpan: 2 },

  // 3. 주소 정보 (자동 완성 연동)
  address: { label: "address", type: "text", colSpan: 3, placeholder: "" },
  state: { label: "State", type: "select", options: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"], colSpan: 1 },
  suburb: { label: "Suburb", type: "select", options: [], colSpan: 1 }, // 로직에서 채워질 예정
  postcode: { label: "Postcode", type: "text", colSpan: 1, readOnly: true, placeholder: "Auto Generate" },

  note: { label: "Note", type: "textarea", colSpan: 3, placeholder: "여기에 상세 내용을 입력하세요 (엔터로 줄바꿈 가능)", section: "ETC" },
};