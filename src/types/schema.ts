export type FieldType = "text" | "number" | "select" | "checkbox" | "date" | "password" | "textarea";

export interface FormField {
  label: string;
  type: FieldType;
  placeholder?: string;
  readOnly?: boolean;
  options?: string[];     // Select 박스용
  colSpan?: 1 | 2 | 3;    // 3열 그리드 내 차지할 칸 수
  breakRow?: boolean;     // 필드 뒤 강제 줄바꿈
  section?: string;       // 📍 해당 필드 직전에 나타날 섹션 타이틀
  description?: string;   // 필드 하단 도움말
}

export interface FormSchema {
  [key: string]: FormField;
}