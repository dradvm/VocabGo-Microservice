export class CreateUserRequest {
  userId: string;
  avatarUrl: string;
  givenName: string;
  familyName: string;
  email: string;
}

export class ClaimKPRequest {
  userId: string;
  kp: number;
}
