export class CreateUserRequest {
  userId: string;
  avatarUrl: string;
  givenName: string;
  familyName: string;
  email: string;
}

export class DoneRequest {
  userId: string;
  kp?: number = 0;
  reward?: number = 0;
}
