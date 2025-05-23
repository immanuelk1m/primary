// Server-only admin service functions
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { PostStatus, Profile } from '@/types'; // Profile 타입 import 추가
import type { Database, Enums, Tables } from '@/types/database.types'; // Tables 타입 추가 import
import type { PostWithRelations, Tag } from '@/types'; // PostWithRelations, Profile, Tag import

// TODO: 각 함수의 반환 타입 및 매개변수 타입을 더 구체적으로 정의해야 합니다.

interface GetUsersParams {
  page?: number; // 페이지 번호 (1부터 시작)
  limit?: number; // 페이지당 항목 수
  search?: string; // 검색어 (닉네임 또는 이메일)
  role?: Enums<'user_role'>; // Enums 헬퍼 사용
  tier?: Enums<'user_tier'>; // Enums 헬퍼 사용
}

/**
 * 관리자용 사용자 목록 및 총 개수 조회
 * @param params 페이지, 개수, 검색어, 역할, 티어 필터
 * @returns 사용자 목록과 총 개수
 */
export async function getUsersForAdmin(params: GetUsersParams = {}) {
  const { page = 1, limit = 10, search, role, tier } = params;
  // getUsersForAdmin 함수 내에서 supabaseAdmin 생성 (오류 수정)
  const supabaseAdmin = createSupabaseAdminClient();

  const query = supabaseAdmin
    .from('users')
    .select('*', { count: 'exact' }); // count 옵션 추가

  // 검색 (닉네임 또는 이메일)
  if (search) {
    query.or(`nickname.ilike.%${search}%,email.ilike.%${search}%`);
  }

  // 역할 필터
  if (role) {
    query.eq('role', role);
  }

  // 티어 필터
  if (tier) {
    query.eq('tier', tier);
  }

  // 페이지네이션
  const start = (page - 1) * limit;
  const end = start + limit - 1;
  query.range(start, end);

  // 정렬 (예: 가입일 내림차순)
  query.order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching users for admin:', error);
    throw new Error(`Failed to fetch users: ${error.message}`);
  }

  console.log(`Fetched ${data?.length} users for admin (total: ${count})`);
  // getUsersForAdmin 함수의 올바른 반환문
  return { users: data as Profile[], count: count ?? 0 };
}

// 관리자용 게시글 목록 조회 파라미터 타입
interface GetAdminPostsParams {
  page?: number; // 페이지 번호 (1부터 시작)
  limit?: number; // 페이지당 항목 수
  // 필요하다면 여기에 status 필터 파라미터 추가 가능
  // status?: Enums<'post_status'> | 'all';
}


/**
 * 관리자용 게시글 목록 및 총 개수 조회 (페이지네이션 포함)
 * @param params 페이지, 개수 등 옵션
 * @returns 게시글 목록과 총 개수
 */
export async function getPostsForAdmin(
  params: GetAdminPostsParams = {}
): Promise<{ posts: PostWithRelations[]; count: number }> {
  const { page = 1, limit = 10 } = params; // 기본값 설정
  console.log(`Fetching posts for admin: page=${page}, limit=${limit}`);
  const supabaseAdmin = createSupabaseAdminClient();

  // 페이지네이션 계산
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Supabase 쿼리 작성
  const query = supabaseAdmin
    .from('posts')
    .select(
      `
      *,
      users!inner ( * ),
      tags ( * )
    `,
      { count: 'exact' } // 전체 개수 조회를 위해 count 옵션 추가
    )
    // 모든 상태를 가져오므로 status 필터는 적용하지 않음
    // 특정 상태만 필요하면 아래 주석 해제 및 수정
    // .eq('status', 'pending')
    // .in('status', ['pending', 'approved', 'rejected', 'needs_revision'])
    .order('created_at', { ascending: false }) // 최신순 정렬
    .range(from, to); // 페이지네이션 적용

  // 쿼리 실행
  const { data, error, count } = await query;

  // 에러 처리
  if (error) {
    console.error('Error fetching posts for admin:', error);
    throw new Error(`Failed to fetch posts: ${error.message}`);
  }

  // 결과 로깅 및 반환
  console.log(`Fetched ${data?.length || 0} posts for admin (total: ${count})`);

  // Supabase의 타입 추론이 복잡한 join을 완벽히 반영 못할 수 있으므로,
  // 반환 시 PostWithRelations[] 타입으로 단언해주는 것이 안전할 수 있습니다.
  // data가 null일 경우 빈 배열 반환, count가 null일 경우 0 반환
  return {
    posts: (data as unknown as PostWithRelations[]) || [], // 타입 단언 추가
    count: count ?? 0,
  };
}

// 신고 목록 조회 파라미터 타입
interface GetReportsParams {
  page?: number;
  limit?: number;
  status?: Enums<'report_status'>;
}

// 신고 데이터와 연관 테이블 정보를 포함하는 타입 정의
export type ReportWithRelations = Tables<'reports'> & {
  posts: Pick<Tables<'posts'>, 'id' | 'title'> | null; // 게시물 정보 (id, title)
  users: Pick<Tables<'users'>, 'id' | 'nickname'> | null; // 신고자 정보 (id, nickname) - 컬럼명 주의: reports 테이블의 reporter_user_id
};

/**
 * 관리자용 신고 목록 및 총 개수 조회
 * @param params 페이지, 개수, 상태 필터
 * @returns 신고 목록과 총 개수
 */
export async function getReportsForAdmin(params: GetReportsParams = {}) {
  const { page = 1, limit = 10, status } = params;
  const supabaseAdmin = createSupabaseAdminClient();

  const query = supabaseAdmin
    .from('reports')
    // 필요한 컬럼 명시 및 관계 테이블 join
    .select(`
      *,
      posts ( id, title ),
      users:reporter_user_id ( id, nickname )
    `, { count: 'exact' });

  // 상태 필터
  if (status) {
    query.eq('status', status);
  }

  // 페이지네이션
  const start = (page - 1) * limit;
  const end = start + limit - 1;
  query.range(start, end);

  // 정렬 (예: 신고 접수일 내림차순)
  query.order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching reports for admin:', error);
    throw new Error(`Failed to fetch reports: ${error.message}`);
  }
  // getReportsForAdmin 함수의 올바른 반환 위치
  console.log(`Fetched ${data?.length} reports for admin (total: ${count})`);
  return { reports: data as ReportWithRelations[], count: count ?? 0 };
}


// updateReportStatusForAdmin 함수를 파일 끝으로 이동 (구조 수정)
/**
 * 관리자용 신고 상태 업데이트
 * @param reportId 업데이트할 신고 ID
 * @param status 새로운 신고 상태 ('processing', 'resolved', 'dismissed')
 * @param adminId 처리한 관리자 ID
 * @returns 업데이트 결과
 */
export async function updateReportStatusForAdmin(
  reportId: string,
  status: Enums<'report_status'>,
  adminId: string
) {
  const supabaseAdmin = createSupabaseAdminClient();

  const updateData: Partial<Tables<'reports'>> = {
    status,
    resolver_admin_id: adminId,
    resolved_at: ['resolved', 'dismissed'].includes(status) ? new Date().toISOString() : null,
  };

  const { error } = await supabaseAdmin
    .from('reports')
    .update(updateData)
    .eq('id', reportId);

  if (error) {
    console.error(`Error updating report ${reportId} status for admin:`, error);
    throw new Error(`Failed to update report status: ${error.message}`);
  }

  console.log(`Report ${reportId} status updated to ${status} by admin ${adminId}`);
  return { success: true };
}

/**
 * 관리자용 게시글 상태 업데이트
 * @param postId 업데이트할 게시글 ID
 * @param status 새로운 게시글 상태 ('approved', 'rejected' 등)
 * @returns 업데이트 결과 (구현 필요)
 */
export async function updatePostStatusForAdmin(postId: string, status: PostStatus) {
  // TODO: Implement post status update logic using supabaseAdmin (Story 6.6)
  console.log(`Updating post ${postId} status to ${status} for admin...`);
  // updatePostStatusForAdmin 함수 내에서 supabaseAdmin 생성 (주석 처리된 중복 제거)
  // 참고: 이 함수는 Story 6.6에서 반려 로직에만 사용됨. 실제 사용 시 주석 해제 필요.
  // const supabaseAdmin = createSupabaseAdminClient();
  // 예시: const { data, error } = await supabaseAdmin.from('posts').update({ status }).eq('id', postId);
  return { success: true }; // 임시 반환값
}

// TODO: 필요한 다른 관리자 서비스 함수 추가 (예: 사용자 역할 변경, 콘텐츠 삭제 등)